/**
 * dsh-idea-wall · 标签墙 / 灵感墙
 *
 * 左栏一面墙，随时贴灵感；在会话里说一句「我有一个灵感……」，插件自己抓这段消息、
 * 调一次小模型归纳成「标题 + 要点 + 标签」，挂到墙上，再在会话里回一句回执。
 *
 * Host 半负责：数据落盘、AI 工具、HTTP 路由、会话消息自动捕获。
 * Client 半在 client.js：左栏图标 + 整页墙。
 */

import { randomUUID } from 'node:crypto'
import {
  applyPatch,
  COLORS,
  loadSettings,
  loadStore,
  makeNote,
  normalizeSettings,
  saveSettings,
  saveStore,
  searchNotes,
} from './lib/store.js'
import { fallbackIdea, refineIdea, resolveModel } from './lib/refine.js'

export const name = 'idea-wall'
// 只 inject 一定存在的服务；llm / agentDefaultModel 用 ctx.get() 运行时取，缺了也能降级。
export const inject = ['tools', 'webServer']

const API_PREFIX = '/plugins/dsh-idea-wall/api'

// 触发词：必须在消息开头附近，避免正文里提到「灵感」也误触发。
const CAPTURE_PATTERNS = [
  /^我?有一个?(?:灵感|想法|点子|脑洞)\s*[：:，,、\s]\s*([\s\S]+)$/,
  /^记(?:一?条|一下)?(?:灵感|到墙上|到灵感墙)\s*[：:，,、\s]\s*([\s\S]+)$/,
  /^灵感\s*[：:]\s*([\s\S]+)$/,
  /^(?:idea|idea wall)\s*[：:]\s*([\s\S]+)$/i,
]

export function matchCapture(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  // 只看开头 40 字，正文中间出现「灵感」不算触发。
  const head = trimmed.slice(0, 40)
  for (const pattern of CAPTURE_PATTERNS) {
    if (!pattern.test(head)) continue
    const match = head.match(pattern)
    if (!match) continue
    const rest = (match[1] || '').trim()
    const suffix = trimmed.slice(head.length)
    return (rest + suffix).trim()
  }
  return null
}

// ------------------------------------------------------------ 工具定义
// 刻意不 import @deepseek-ai/dsh-tools：link 安装时解析不到 profile 里的包。

function compileParameters(parameters = {}) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(parameters)) {
    const { required: isRequired, ...rest } = spec ?? {}
    properties[key] = { ...rest }
    if (isRequired === true) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function validateArguments(schema, args) {
  const violations = []
  const value = args && typeof args === 'object' ? args : {}
  for (const key of schema.required ?? []) {
    if (value[key] === undefined || value[key] === null) violations.push(`缺少必填参数: ${key}`)
  }
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    const given = value[key]
    if (given === undefined || given === null) continue
    const expected = propSchema.type
    if (!expected) continue
    const actual = typeOf(given)
    const ok = expected === 'number' ? actual === 'number' || actual === 'integer' : actual === expected
    if (!ok) violations.push(`参数 ${key} 应为 ${expected}，收到 ${actual}`)
  }
  return violations
}

function defineTool(options) {
  const schema = compileParameters(options.parameters)
  return {
    name: options.name,
    description: options.description,
    parameters: schema,
    output: options.output,
    async execute(args, exec) {
      const violations = validateArguments(schema, args)
      if (violations.length > 0) {
        const error = new Error(`参数不合法: ${violations.join('; ')}`)
        error.code = 'invalid_arguments'
        throw error
      }
      return await options.execute(args ?? {}, exec)
    },
  }
}

/** 四个工具共用的输出：一段给人阅读的文本，结构化数据附在 meta 里。 */
const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      text: { type: 'string' },
      note: { type: 'object', additionalProperties: true },
      count: { type: 'integer' },
      notes: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
  render(_args, value) {
    const text = typeof value?.text === 'string' ? value.text : JSON.stringify(value ?? null)
    return [{ type: 'text', text }]
  },
}

function toLosslessJson(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(toLosslessJson)
  const out = {}
  for (const [key, item] of Object.entries(value)) out[key] = toLosslessJson(item)
  return out
}

// ------------------------------------------------------------ 摘要文本

/** 工具返回给模型的便签摘要，正文截断，别把整面墙塞进上下文。 */
function noteView(note, full = false) {
  return {
    id: note.id,
    title: note.title,
    body: full ? note.body : note.body.slice(0, 400),
    tags: note.tags,
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    created: new Date(note.created).toISOString(),
    source: note.source?.sessionId ? { sessionId: note.source.sessionId, quote: note.source.quote } : null,
  }
}

// ------------------------------------------------------------ HTTP 小工具

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('body is not JSON'))
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

// ------------------------------------------------------------ 插件主体

export async function apply(ctx, rawConfig = {}) {
  const log = (message) => {
    try { ctx?.logger?.info?.(`[idea-wall] ${message}`) } catch { /* logger 不可用就静默 */ }
  }

  const fallbackSettings = normalizeSettings(rawConfig, { capture: true, model: null })
  let settings = normalizeSettings(await loadSettings(), fallbackSettings)
  let store = await loadStore(log)
  let writeChain = Promise.resolve()
  const capturedMessageIds = new Set()
  // 诊断用：最近几次 pre-step 看到的消息与判定，GET /debug 可查。
  const debug = { preStepCalls: 0, observations: [] }

  /** 所有写操作排队，避免并发写坏 store。 */
  function mutate(operation) {
    const run = writeChain.then(async () => {
      const result = await operation(store)
      store = await saveStore(result.store, log)
      return result.value
    })
    writeChain = run.catch(() => {})
    return run
  }

  /** 把「原文 + 可选提炼结果」挂到墙上，返回落盘的便签。 */
  async function captureNote(text, { source, refined } = {}) {
    const idea = refined || fallbackIdea(text)
    const note = makeNote({
      title: idea.title,
      body: idea.body,
      tags: idea.tags,
      color: idea.color,
      source,
    })
    await mutate((current) => {
      return { value: note, store: { version: 1, notes: [note, ...current.notes].slice(0, 5000) } }
    })
    return note
  }

  async function refineForCapture(text) {
    const llm = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    const selection = resolveModel(defaultModel, settings.model)
    if (!selection) return { idea: null, error: '没有可用的默认模型' }
    try {
      const idea = await refineIdea({ llm, selection, text, log })
      return { idea, error: null }
    } catch (error) {
      log(`提炼失败，退回原文：${error?.message || error}`)
      return { idea: null, error: String(error?.message || error) }
    }
  }

  // -------------------------------------------------- AI 工具

  const tools = [
    defineTool({
      name: 'idea_wall_add',
      description:
        '把一条灵感挂到「灵感墙」（左栏那面墙）。内容可以是用户原话，也可以是你已经总结好的标题 + 要点 + 标签。'
        + '用户说「我有一个灵感」「记一条灵感」「记到墙上」时，如果自动捕获没触发（例如这句里没有触发词），你主动调用它。',
      parameters: {
        text: { type: 'string', required: true, description: '灵感原文，或你要挂上去的正文' },
        title: { type: 'string', description: '短标题（≤20 字）；不给就用正文首行' },
        body: { type: 'string', description: '要点正文（2-4 行，每行以「- 」开头）；不给就用 text' },
        tags: { type: 'array', items: { type: 'string' }, description: '2-4 个短标签，不带 # 号' },
        color: { type: 'string', description: `便签颜色：${COLORS.join(' / ')}` },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const text = String(args.text || '').trim()
        if (!text) throw new Error('text 不能为空')
        const note = makeNote({
          title: args.title || undefined,
          body: args.body || text,
          tags: args.tags || [],
          color: args.color || 'amber',
        })
        await mutate((current) => ({ value: note, store: { version: 1, notes: [note, ...current.notes] } }))
        return toLosslessJson({
          text: `已挂到灵感墙：${note.title}${note.tags.length ? ` · ${note.tags.map((tag) => `#${tag}`).join(' ')}` : ''}`,
          note: noteView(note, true),
        })
      },
    }),

    defineTool({
      name: 'idea_wall_list',
      description: '读灵感墙：按关键词 / 标签筛选，返回便签列表（标题、要点、标签、时间）。',
      parameters: {
        query: { type: 'string', description: '关键词，搜标题 / 正文 / 标签' },
        tag: { type: 'string', description: '只看某个标签' },
        includeArchived: { type: 'boolean', description: '是否包含已归档的便签，默认 false' },
        limit: { type: 'integer', description: '最多返回多少条，默认 50，上限 200' },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const limit = Math.min(Number(args.limit) || 50, 200)
        const notes = searchNotes(store.notes, {
          query: args.query || '',
          tag: args.tag || '',
          includeArchived: Boolean(args.includeArchived),
          limit,
        })
        const lines = notes.map((note) => {
          const tagLine = note.tags.length ? ` ${note.tags.map((tag) => `#${tag}`).join(' ')}` : ''
          const bodyLine = note.body ? `：${note.body.replace(/\n+/g, ' ').slice(0, 120)}` : ''
          return `- [${note.id}] ${note.title}${note.pinned ? ' [置顶]' : ''}${tagLine}${bodyLine}`
        })
        return toLosslessJson({
          text: notes.length === 0
            ? '灵感墙上没有符合条件的便签。'
            : `灵感墙上有 ${notes.length} 条：\n${lines.join('\n')}`,
          count: notes.length,
          notes: notes.map((note) => noteView(note)),
        })
      },
    }),

    defineTool({
      name: 'idea_wall_update',
      description: '修改灵感墙上的便签：改标题 / 正文 / 标签 / 颜色，或置顶、归档。',
      parameters: {
        id: { type: 'string', required: true, description: '便签 id（从 idea_wall_list 拿）' },
        title: { type: 'string', description: '新标题' },
        body: { type: 'string', description: '新正文' },
        tags: { type: 'array', items: { type: 'string' }, description: '新的完整标签列表（会整体替换）' },
        color: { type: 'string', description: `颜色：${COLORS.join(' / ')}` },
        pinned: { type: 'boolean', description: '是否置顶' },
        archived: { type: 'boolean', description: '是否归档' },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const id = String(args.id || '')
        const target = store.notes.find((note) => note.id === id)
        if (!target) return toLosslessJson({ text: `找不到 id=${id} 的便签。先用 idea_wall_list 查一下。`, ok: false })
        const next = applyPatch(target, {
          title: args.title,
          body: args.body,
          tags: args.tags,
          color: args.color,
          pinned: args.pinned,
          archived: args.archived,
        })
        await mutate((current) => ({
          value: next,
          store: { version: 1, notes: current.notes.map((note) => (note.id === id ? next : note)) },
        }))
        return toLosslessJson({ text: `已更新：${next.title}`, note: noteView(next, true) })
      },
    }),

    defineTool({
      name: 'idea_wall_remove',
      description: '从灵感墙撕掉一张便签。',
      parameters: {
        id: { type: 'string', required: true, description: '便签 id' },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const id = String(args.id || '')
        const exists = store.notes.some((note) => note.id === id)
        if (!exists) return toLosslessJson({ text: `找不到 id=${id} 的便签。`, ok: false })
        await mutate((current) => ({
          value: null,
          store: { version: 1, notes: current.notes.filter((note) => note.id !== id) },
        }))
        return toLosslessJson({ text: '已从灵感墙撕掉。', ok: true })
      },
    }),
  ]

  const disposers = tools.map((tool) => ctx.tools.register(tool))

  // -------------------------------------------------- HTTP 路由（给左栏墙用）

  const apiHandler = async (req, res, next) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (!url.pathname.startsWith(API_PREFIX)) {
      if (typeof next === 'function') return next()
      return json(res, 404, { ok: false, error: 'not found' })
    }
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
    }
    try {
      if (req.method === 'GET' && route === '/list') {
        const query = url.searchParams.get('q') || ''
        const tag = url.searchParams.get('tag') || ''
        const includeArchived = url.searchParams.get('archived') === '1'
        const notes = searchNotes(store.notes, { query, tag, includeArchived, limit: 500 })
        return json(res, 200, { ok: true, notes: notes.map((note) => noteView(note, true)) })
      }
      if (req.method === 'GET' && route === '/tags') {
        const counts = new Map()
        for (const note of store.notes) {
          for (const tag of note.tags) counts.set(tag, (counts.get(tag) || 0) + 1)
        }
        const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
        return json(res, 200, { ok: true, tags })
      }
      if (req.method === 'POST' && route === '/add') {
        const body = await readBody(req)
        const text = String(body.text || '').trim()
        const title = String(body.title || '').trim()
        if (!text && !title) return json(res, 400, { ok: false, error: '标题和正文至少要有一个' })
        const note = makeNote({
          title: title || undefined,
          body: text || title,
          tags: Array.isArray(body.tags) ? body.tags : [],
          color: body.color,
        })
        await mutate((current) => ({ value: note, store: { version: 1, notes: [note, ...current.notes] } }))
        return json(res, 200, { ok: true, note: noteView(note, true) })
      }
      if (req.method === 'POST' && route === '/update') {
        const body = await readBody(req)
        const id = String(body.id || '')
        const target = store.notes.find((note) => note.id === id)
        if (!target) return json(res, 404, { ok: false, error: '没有这张便签' })
        const next = applyPatch(target, {
          title: body.title,
          body: body.body,
          tags: body.tags,
          color: body.color,
          pinned: body.pinned,
          archived: body.archived,
        })
        await mutate((current) => ({
          value: next,
          store: { version: 1, notes: current.notes.map((note) => (note.id === id ? next : note)) },
        }))
        return json(res, 200, { ok: true, note: noteView(next, true) })
      }
      if (req.method === 'POST' && route === '/remove') {
        const body = await readBody(req)
        const id = String(body.id || '')
        await mutate((current) => ({
          value: null,
          store: { version: 1, notes: current.notes.filter((note) => note.id !== id) },
        }))
        return json(res, 200, { ok: true })
      }
      if (req.method === 'GET' && route === '/settings') {
        let selection = null
        try { selection = resolveModel(ctx.get('agentDefaultModel'), null) } catch { /* 忽略 */ }
        return json(res, 200, { ok: true, settings: { ...settings, resolvedModel: selection } })
      }
      if (req.method === 'POST' && route === '/settings') {
        const body = await readBody(req)
        settings = normalizeSettings(body, settings)
        await saveSettings(settings)
        return json(res, 200, { ok: true, settings })
      }
      if (req.method === 'POST' && route === '/refine') {
        // 给客户端「AI 整理一下」用：正文整理好返回，不落盘。
        const body = await readBody(req)
        const text = String(body.text || '').trim()
        if (!text) return json(res, 400, { ok: false, error: 'text 不能为空' })
        const { idea, error } = await refineForCapture(text)
        return json(res, 200, { ok: true, idea: idea || fallbackIdea(text), refined: Boolean(idea), error })
      }
      if (req.method === 'GET' && route === '/debug') {
        // 诊断：看 pre-step 到底看到了什么消息、有没有命中。
        return json(res, 200, {
          ok: true,
          capture: settings.capture,
          model: (() => { try { return resolveModel(ctx.get('agentDefaultModel'), settings.model) } catch { return null } })(),
          capturedCount: capturedMessageIds.size,
          debug,
        })
      }
      return json(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      log(`http ${req.method} ${route}: ${error?.message || error}`)
      return json(res, 500, { ok: false, error: String(error?.message || error) })
    }
  }

  try {
    if (ctx?.webServer && typeof ctx.effect === 'function') {
      ctx.effect(
        () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: apiHandler }),
        'idea-wall: api',
      )
    } else {
      log('webServer 不可用：左栏墙的接口没挂上')
    }
  } catch (error) {
    log(`API 挂载失败：${error?.message || error}`)
  }

  // -------------------------------------------------- 会话自动捕获
  // 用户说「我有一个灵感……」，pre-step 里抓住这条消息，提炼后挂墙，
  // 并追加一条运行时快照，让模型知道「已经挂上了」，不用它再手动调工具。

  const preStepHandler = async (payload, next) => {
    const decision = await next()
    try {
      if (!settings.capture) return decision
      if (!decision || decision.kind === 'reject') return decision
      if (payload?.signal?.aborted) return decision

      const messages = Array.isArray(payload?.messages) ? payload.messages : []
      const candidate = [...messages].reverse().find((message) => {
        if (!message || message.role !== 'user') return false
        const kind = message.source?.kind
        if (kind && kind !== 'user') return false
        if (capturedMessageIds.has(message.id)) return false
        return true
      })
      // 诊断：记录入口处的消息形态（只留最近 12 次）。
      debug.preStepCalls += 1
      debug.observations.push({
        at: Date.now(),
        turn: payload?.turn,
        step: payload?.step,
        session: payload?.agent?.sessionId,
        messages: messages.map((message) => ({
          role: message?.role,
          kind: message?.source?.kind,
          id: String(message?.id ?? '').slice(0, 10),
          text: String((message?.content ?? []).map((block) => block?.text ?? '').join(' ')).slice(0, 90),
        })),
        picked: candidate ? String(candidate.id ?? '').slice(0, 10) : null,
      })
      if (debug.observations.length > 12) debug.observations.shift()
      if (!candidate) return decision

      const text = (candidate.content ?? [])
        .filter((block) => block?.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
      if (!text) return decision

      const captured = matchCapture(text)
      if (!captured) return decision

      capturedMessageIds.add(candidate.id)
      const { idea, error } = await refineForCapture(captured)
      const note = await captureNote(captured, {
        source: { sessionId: payload?.agent?.sessionId, quote: text.slice(0, 400) },
        refined: idea || undefined,
      })

      const tagLine = note.tags.length ? ` · ${note.tags.map((tag) => `#${tag}`).join(' ')}` : ''
      const suffix = idea
        ? ''
        : `（AI 提炼没成功${error ? `：${error.slice(0, 60)}` : ''}，先按原文挂上了，你可以说「改一下」让我重排）`
      const notice = {
        role: 'user',
        id: randomUUID(),
        content: [{
          type: 'text',
          text: `[灵感墙] 已自动挂上「${note.title}」${tagLine}。${suffix}\n这张便签已经在左栏墙上，不需要再调用工具重复添加。`,
        }],
        source: { kind: 'idea-wall', form: 'snapshot', sections: [] },
      }

      const existing = Array.isArray(decision?.messages) ? decision.messages : []
      return { ...decision, messages: [...existing, notice] }
    } catch (error) {
      log(`自动捕获失败：${error?.message || error}`)
      return decision
    }
  }

  let disposePreStep
  try {
    disposePreStep = ctx.on('agent/pre-step', preStepHandler, { prepend: true })
  } catch (error) {
    log(`pre-step 钩子没挂上：${error?.message || error}`)
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) { try { dispose?.() } catch { /* 忽略 */ } }
    try { disposePreStep?.() } catch { /* 忽略 */ }
  }, 'idea-wall: dispose')

  log(`已加载：${store.notes.length} 条便签，自动捕获${settings.capture ? '开' : '关'}`)
}

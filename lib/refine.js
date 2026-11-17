/**
 * 灵感墙 · AI 提炼
 *
 * 调一次模型（不建会话），把用户的一句话灵感整理成便签四件套：
 * 标题 / 要点正文 / 标签 / 颜色。失败就退回「原文当正文」，保证灵感不会丢。
 */

const SYSTEM = [
  '你是「灵感墙」的整理助手。用户会给你一段随手记的灵感原文，你把它整理成一张便签。',
  '只输出一行 JSON，不要任何解释、不要代码围栏，形如：',
  '{"title":"20 字以内的短标题","body":"2-4 行要点，每行以「- 」开头","tags":["2-4个中文短标签"],"color":"amber"}',
  '规则：',
  '- title：抓这句话里最值得记住的那个点，不要复述原句。',
  '- body：保留原文的关键信息（数字、名字、决定），不要编造原文没有的内容。',
  '- tags：2-4 个短标签，中文优先，每个不超过 6 字；不要带 # 号。',
  '- color 只能取：amber（产品/想法）、rose（情绪/感慨）、sky（技术/学习）、mint（生活/习惯）、lilac（创作/内容）、cream（其他）。',
].join('\n')

const COLORS = ['amber', 'rose', 'sky', 'mint', 'lilac', 'cream']

function cleanJson(text) {
  let raw = String(text || '').trim()
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function pickText(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

function normalizeResult(parsed, fallbackTitle) {
  const title = pickText(parsed?.title, 80) || fallbackTitle
  const body = pickText(parsed?.body, 4000)
  const tags = Array.isArray(parsed?.tags)
    ? parsed.tags.map((tag) => pickText(String(tag), 24).replace(/^#+/, '')).filter(Boolean).slice(0, 6)
    : []
  const color = COLORS.includes(parsed?.color) ? parsed.color : 'amber'
  return { title, body, tags, color }
}

/** 从默认模型服务里拿当前选择；拿不到返回 null。 */
export function resolveModel(defaultModelService, override) {
  if (override?.provider && override?.model) return override
  try {
    const selection = defaultModelService?.currentSelection?.()
    if (selection?.provider && selection?.model) {
      return { provider: selection.provider, model: selection.model }
    }
  } catch { /* 拿不到就交给调用方兜底 */ }
  return null
}

/**
 * 提炼一条灵感。成功返回 { title, body, tags, color }；
 * 任何失败都抛出，调用方用原文兜底。
 */
export async function refineIdea({ llm, selection, text, log = () => {}, timeoutMs = 20000 }) {
  if (!llm || typeof llm.prepareCall !== 'function') throw new Error('llm 服务不可用')
  if (!selection?.provider || !selection?.model) throw new Error('没有可用的默认模型')

  const call = await llm.prepareCall({
    provider: selection.provider,
    model: selection.model,
    maxTokens: 600,
    reasoningEffort: 'off',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const options = {
      ...call.config,
      system: SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      signal: controller.signal,
    }
    let raw = ''
    for await (const chunk of call.stream(options)) {
      if (chunk?.type === 'text-delta') raw += chunk.text ?? ''
      else if (chunk?.type === 'finish') {
        if (chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message || '模型请求失败')
        if (chunk.reason?.kind === 'aborted') throw new Error('提炼被中止')
      }
    }
    const parsed = cleanJson(raw)
    if (!parsed) throw new Error(`提炼结果不是 JSON：${raw.slice(0, 120)}`)
    return normalizeResult(parsed, pickText(text, 60))
  } finally {
    clearTimeout(timer)
  }
}

/** 提炼失败时的兜底：原文变正文，标题取首句。 */
export function fallbackIdea(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim()
  const firstLine = clean.split('\n').find((line) => line.trim()) || '新灵感'
  const title = firstLine.replace(/^[-*\d.\s]+/, '').slice(0, 60) || '新灵感'
  return { title, body: clean.slice(0, 4000), tags: [], color: 'amber' }
}

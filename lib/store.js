/**
 * 灵感墙 · 数据层
 *
 * 一张便签 = store.json 里的一个对象；图片之类第一版不做。
 * 写入先写临时文件再原子替换，避免进程被强杀时留下半截 JSON。
 * 文件损坏时改名成 store.corrupt-<时间>.json 保留证据，再从空墙开始。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** DSH_HOME 优先；没设置时退回 ~/.dsh。 */
export function dataDir() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim()
  return join(home || join(homedir(), '.dsh'), 'idea-wall')
}

export const STORE_FILE = () => join(dataDir(), 'store.json')
export const SETTINGS_FILE = () => join(dataDir(), 'settings.json')

export const COLORS = ['amber', 'rose', 'sky', 'mint', 'lilac', 'cream']

const EMPTY = () => ({ version: 1, notes: [] })

function sanitizeText(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

function sanitizeTags(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const raw of input) {
    const tag = sanitizeText(String(raw ?? ''), 24).replace(/^#+/, '')
    if (!tag) continue
    if (!out.includes(tag) && out.length < 6) out.push(tag)
  }
  return out
}

export function normalizeNote(input = {}) {
  const now = Date.now()
  const title = sanitizeText(input.title, 80)
  const body = sanitizeText(input.body, 4000)
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `iw_${randomUUID().slice(0, 8)}`,
    title: title || (body.split('\n')[0] || '').slice(0, 80) || '未命名灵感',
    body,
    tags: sanitizeTags(input.tags),
    color: COLORS.includes(input.color) ? input.color : 'amber',
    created: Number.isFinite(input.created) ? input.created : now,
    updated: Number.isFinite(input.updated) ? input.updated : now,
    pinned: Boolean(input.pinned),
    archived: Boolean(input.archived),
    // 来源：哪次会话、哪句原话。只记 sessionId 和原话片段，不抓整段上下文。
    source: input.source && typeof input.source === 'object'
      ? {
          sessionId: typeof input.source.sessionId === 'string' ? input.source.sessionId : undefined,
          quote: sanitizeText(input.source.quote, 400) || undefined,
        }
      : undefined,
  }
}

async function atomicWrite(file, text) {
  await mkdir(dataDir(), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

export async function loadStore(log = () => {}) {
  const file = STORE_FILE()
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return EMPTY()
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.notes)) return EMPTY()
    const notes = parsed.notes.map((note) => normalizeNote(note))
    return { version: 1, notes }
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}.json`
    try { await rename(file, backup) } catch { /* 备份失败也别覆盖原文件 */ return EMPTY() }
    log(`store.json 解析失败，已备份到 ${backup}：${error?.message || error}`)
    return EMPTY()
  }
}

export async function saveStore(store, log = () => {}) {
  const normalized = {
    version: 1,
    notes: (store.notes ?? []).map((note) => normalizeNote(note)),
  }
  try {
    await atomicWrite(STORE_FILE(), `${JSON.stringify(normalized, null, 2)}\n`)
  } catch (error) {
    log(`写 store.json 失败：${error?.message || error}`)
    throw error
  }
  return normalized
}

/** 新便签追加到最前面（最新在上）。text 是正文的别名，方便工具层直接传原文。 */
export function makeNote(input = {}) {
  const source = { ...input }
  if (!source.body && typeof source.text === 'string') source.body = source.text
  delete source.text
  return normalizeNote({ ...source, created: Date.now(), updated: Date.now() })
}

export function applyPatch(note, patch = {}) {
  const next = { ...note }
  if (patch.title !== undefined) next.title = sanitizeText(patch.title, 80)
  if (patch.body !== undefined) next.body = sanitizeText(patch.body, 4000)
  if (patch.tags !== undefined) next.tags = sanitizeTags(patch.tags)
  if (patch.color !== undefined && COLORS.includes(patch.color)) next.color = patch.color
  if (patch.pinned !== undefined) next.pinned = Boolean(patch.pinned)
  if (patch.archived !== undefined) next.archived = Boolean(patch.archived)
  next.updated = Date.now()
  if (!next.title) next.title = (next.body.split('\n')[0] || '').slice(0, 80) || '未命名灵感'
  return normalizeNote(next)
}

export function searchNotes(notes, { query = '', tag = '', includeArchived = false, limit = 200 } = {}) {
  const q = String(query || '').trim().toLowerCase()
  const wantedTag = String(tag || '').trim()
  const list = notes.filter((note) => {
    if (!includeArchived && note.archived) return false
    if (wantedTag && !note.tags.includes(wantedTag)) return false
    if (!q) return true
    const hay = `${note.title}\n${note.body}\n${note.tags.join(' ')}`.toLowerCase()
    return hay.includes(q)
  })
  list.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.created - a.created))
  return list.slice(0, Math.max(1, Math.min(Number(limit) || 200, 500)))
}

// ---------------------------------------------------------------- settings

export function normalizeSettings(input = {}, fallback = { capture: true, model: null }) {
  const base = {
    capture: typeof fallback?.capture === 'boolean' ? fallback.capture : true,
    model: fallback?.model && typeof fallback.model === 'object'
      ? { provider: fallback.model.provider, model: fallback.model.model }
      : null,
  }
  if (!input || typeof input !== 'object') return base
  if (typeof input.capture === 'boolean') base.capture = input.capture
  if (input.model === null) base.model = null
  else if (input.model && typeof input.model === 'object' && input.model.provider && input.model.model) {
    base.model = { provider: String(input.model.provider), model: String(input.model.model) }
  }
  return base
}

export async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_FILE(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function saveSettings(settings) {
  await atomicWrite(SETTINGS_FILE(), `${JSON.stringify(settings, null, 2)}\n`)
}

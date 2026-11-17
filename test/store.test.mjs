import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 测试用临时 DSH_HOME，别碰真实灵感墙。
const sandbox = await mkdtemp(join(tmpdir(), 'idea-wall-test-'))
process.env.DSH_HOME = sandbox

const store = await import('../lib/store.js')

test('空目录时返回空墙', async () => {
  const data = await store.loadStore()
  assert.equal(Array.isArray(data.notes), true)
  assert.equal(data.notes.length, 0)
})

test('新便签有 id / 标题兜底 / 默认颜色', () => {
  const note = store.makeNote({ text: '随便一句' })
  assert.ok(note.id.startsWith('iw_'))
  assert.equal(note.title, '随便一句')
  assert.equal(note.color, 'amber')
  assert.equal(note.pinned, false)
})

test('保存后能读回，并保留顺序', async () => {
  const a = store.makeNote({ title: '第一条', body: '正文一' })
  const b = store.makeNote({ title: '第二条', body: '正文二' })
  await store.saveStore({ version: 1, notes: [a, b] })
  const data = await store.loadStore()
  assert.equal(data.notes.length, 2)
  assert.equal(data.notes[0].title, '第一条')
})

test('损坏的 store 会备份再重开空墙', async () => {
  const file = store.STORE_FILE()
  await writeFile(file, '{ not json', 'utf8')
  const logs = []
  const data = await store.loadStore((message) => logs.push(message))
  assert.equal(data.notes.length, 0)
  assert.equal(logs.length, 1)
  const raw = await readFile(join(sandbox, 'idea-wall', 'store.json'), 'utf8').catch(() => '')
  assert.equal(raw, '')
})

test('标签去重、去掉 #、最多 6 个', () => {
  const note = store.makeNote({ title: 't', tags: ['#产品', '产品', '交互', 'a', 'b', 'c', 'd', 'e'] })
  assert.deepEqual(note.tags, ['产品', '交互', 'a', 'b', 'c', 'd'])
})

test('applyPatch 改字段并更新 updated', () => {
  const note = store.makeNote({ title: '旧', body: '旧正文', tags: ['x'] })
  const patched = store.applyPatch(note, { title: '新', pinned: true })
  assert.equal(patched.title, '新')
  assert.equal(patched.pinned, true)
  assert.equal(patched.tags[0], 'x')
  assert.ok(patched.updated >= note.updated)
})

test('searchNotes 按关键词和标签过滤，置顶优先', () => {
  const a = store.makeNote({ title: '苹果', body: '水果', tags: ['生活'] })
  const b = store.makeNote({ title: '香蕉', body: '也是水果', tags: ['生活'] })
  const c = store.makeNote({ title: '鲨鱼', body: '海洋', tags: ['动物'], pinned: true })
  const notes = [a, b, c]
  assert.equal(store.searchNotes(notes, { query: '水果' }).length, 2)
  assert.equal(store.searchNotes(notes, { tag: '动物' })[0].title, '鲨鱼')
  assert.equal(store.searchNotes(notes, { query: '不存在' }).length, 0)
  assert.equal(store.searchNotes(notes, {})[0].title, '鲨鱼')
})

test('归档的便签默认不出现', () => {
  const a = store.makeNote({ title: '归档我' })
  const b = store.makeNote({ title: '留着我' })
  b.archived = true
  assert.equal(store.searchNotes([a, b], {}).length, 1)
  assert.equal(store.searchNotes([a, b], { includeArchived: true }).length, 2)
})

test.after(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

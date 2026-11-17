import { test } from 'node:test'
import assert from 'node:assert/strict'

import { matchCapture } from '../index.js'

test('「我有一个灵感：」命中，且取到正文', () => {
  assert.equal(matchCapture('我有一个灵感：把标签墙做成会话自动挂载'), '把标签墙做成会话自动挂载')
})

test('「灵感：」命中', () => {
  assert.equal(matchCapture('灵感：用便签墙记录所有碎片想法'), '用便签墙记录所有碎片想法')
})

test('「记到墙上」命中', () => {
  assert.equal(matchCapture('记到墙上：明天给灵感墙加个导出'), '明天给灵感墙加个导出')
})

test('「记一条灵感」命中', () => {
  assert.equal(matchCapture('记一条灵感：色卡要能自定义'), '色卡要能自定义')
})

test('普通提问不命中', () => {
  assert.equal(matchCapture('帮我看看灵感墙的代码有没有问题'), null)
  assert.equal(matchCapture('这个标签墙插件要怎么装？'), null)
})

test('正文中间提到「灵感」不命中', () => {
  assert.equal(matchCapture('这个页面的灵感来源是便签墙，你觉得好看吗'), null)
})

test('空串不命中', () => {
  assert.equal(matchCapture(''), null)
  assert.equal(matchCapture('   '), null)
})

test('英文触发词命中', () => {
  assert.equal(matchCapture('idea: a wall that captures ideas from chat'), 'a wall that captures ideas from chat')
})

test('多行灵感保留换行', () => {
  const text = '我有一个灵感：\n第一行\n第二行'
  const out = matchCapture(text)
  assert.ok(out.includes('第一行'))
  assert.ok(out.includes('第二行'))
})

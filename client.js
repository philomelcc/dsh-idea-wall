// 灵感墙 · 左栏一面墙：便签网格 + 标签筛选 + 搜索 + 就地编辑。
// 颜色全部走 DSH 主题 token（--dsw-alias-*），便签底色用 color-mix 混进主题底色，
// 暗色主题下也不会亮瞎眼。
window.__ModuleLoader__.load({
  id: '@local/dsh-idea-wall',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState } = React
    const h = React.createElement

    const API = '/plugins/dsh-idea-wall/api'

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      sub: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l1)',
      strong: 'var(--dsw-alias-border-selected)',
      card: 'var(--dsw-alias-settings-card-fill)',
      surface: 'var(--dsw-alias-interactive-bg-hover)',
      input: 'var(--dsw-alias-bg-base)',
      mask: 'var(--dsw-alias-bg-mask-1)',
      danger: 'var(--dsw-alias-state-error-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      ghost: 'var(--dsw-alias-button-ghost-active-fill)',
    }

    // 便签纸色：琥珀 / 玫瑰 / 天蓝 / 薄荷 / 丁香 / 奶油
    const PALETTE = {
      amber: { ink: '#f5c451', name: '琥珀' },
      rose: { ink: '#ef8fa4', name: '玫瑰' },
      sky: { ink: '#7db8e8', name: '天蓝' },
      mint: { ink: '#7fce9f', name: '薄荷' },
      lilac: { ink: '#b49ae6', name: '丁香' },
      cream: { ink: '#d9c9a8', name: '奶油' },
    }
    const COLORS = Object.keys(PALETTE)

    const paper = (color, strength = 16) => {
      const ink = PALETTE[color]?.ink ?? PALETTE.amber.ink
      return {
        background: `color-mix(in srgb, ${ink} ${strength}%, ${C.card})`,
        border: `1px solid color-mix(in srgb, ${ink} 42%, ${C.border})`,
      }
    }

    const S = {
      page: { padding: '22px 26px 40px', color: C.text, minHeight: '100%', overflow: 'auto' },
      inner: { maxWidth: '1180px', margin: '0 auto' },
      top: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' },
      title: { fontSize: '18px', fontWeight: 700, letterSpacing: '0.01em', marginRight: '4px' },
      count: { fontSize: '11.5px', color: C.faint, marginTop: '2px' },
      search: {
        flex: '1 1 200px', minWidth: '160px', maxWidth: '340px',
        background: C.input, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: '9px', padding: '7px 11px', fontSize: '12.5px', outline: 'none',
      },
      primary: {
        border: `1px solid ${C.text}`, background: C.text, color: 'var(--dsw-alias-bg-base)',
        borderRadius: '9px', padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
      },
      ghost: {
        border: `1px solid ${C.border}`, background: 'transparent', color: C.text,
        borderRadius: '9px', padding: '7px 11px', fontSize: '12.5px', cursor: 'pointer',
      },
      chips: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' },
      chip: (on) => ({
        border: `1px solid ${on ? C.strong : C.border}`,
        background: on ? C.ghost : 'transparent',
        color: on ? C.text : C.sub,
        borderRadius: '999px', padding: '4px 11px', fontSize: '12px', cursor: 'pointer',
        fontWeight: on ? 700 : 400,
      }),
      grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))',
        gap: '12px',
        alignItems: 'start',
      },
      note: {
        position: 'relative', borderRadius: '12px', padding: '12px 13px 10px',
        display: 'flex', flexDirection: 'column', gap: '7px', minHeight: '86px',
        overflow: 'hidden', transition: 'box-shadow 120ms ease',
      },
      noteTitle: { fontSize: '13.5px', fontWeight: 700, lineHeight: 1.45, wordBreak: 'break-word' },
      noteBody: { fontSize: '12px', lineHeight: 1.65, color: C.sub, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '170px', overflow: 'hidden' },
      tags: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
      tag: {
        fontSize: '10.5px', color: C.sub, background: 'color-mix(in srgb, currentColor 8%, transparent)',
        border: `1px solid ${C.border}`, borderRadius: '999px', padding: '1px 7px', cursor: 'pointer',
      },
      foot: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' },
      time: { fontSize: '10.5px', color: C.faint, flex: 1 },
      mini: {
        border: 'transparent', background: 'transparent', color: C.faint, cursor: 'pointer',
        fontSize: '11px', padding: '2px 4px', borderRadius: '6px', lineHeight: 1,
      },
      empty: {
        border: `1px dashed ${C.border}`, borderRadius: '14px', padding: '48px 20px', textAlign: 'center',
        color: C.faint, fontSize: '12.5px', lineHeight: 2,
      },
      mask: { position: 'fixed', inset: 0, background: C.mask, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      dialog: {
        width: 'min(560px, 92vw)', maxHeight: '86vh', overflow: 'auto', background: C.card,
        border: `1px solid ${C.border}`, borderRadius: '14px', padding: '18px',
        display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
      },
      label: { fontSize: '11.5px', color: C.sub, marginBottom: '2px' },
      input: {
        width: '100%', boxSizing: 'border-box', background: C.input, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: '9px', padding: '8px 11px', fontSize: '12.5px',
        outline: 'none', fontFamily: 'inherit',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.input, color: C.text,
        border: `1px solid ${C.border}`, borderRadius: '9px', padding: '9px 11px', fontSize: '12.5px',
        outline: 'none', resize: 'vertical', minHeight: '104px', fontFamily: 'inherit', lineHeight: 1.7,
      },
      row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      dot: (color, on) => ({
        width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer',
        background: PALETTE[color].ink, padding: 0,
        border: on ? `2px solid ${C.text}` : `2px solid transparent`,
        outline: on ? `1px solid ${C.border}` : 'none',
      }),
      hint: { fontSize: '11px', color: C.faint, lineHeight: 1.7 },
      error: { fontSize: '12px', color: C.danger, minHeight: '16px' },
      ok: { fontSize: '12px', color: C.ok, minHeight: '16px' },
      sep: { height: '1px', background: C.border, margin: '2px 0' },
      settingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0' },
    }

    async function api(path, options = {}) {
      const init = {
        method: options.method || 'GET',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
      }
      if (options.body !== undefined) init.body = JSON.stringify(options.body)
      let response
      try {
        response = await fetch(`${API}${path}`, init)
      } catch {
        throw new Error('连不上灵感墙插件（host 半可能还没加载）')
      }
      const raw = await response.text().catch(() => '')
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch { throw new Error('后端返回的不是 JSON') }
      if (!data?.ok) throw new Error(data?.error || `请求失败 ${response.status}`)
      return data
    }

    function fmtTime(iso) {
      const date = iso ? new Date(iso) : null
      if (!date || Number.isNaN(date.getTime())) return ''
      const now = Date.now()
      const diff = now - date.getTime()
      if (diff < 60_000) return '刚刚'
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    // ---------------------------------------------------------------- 图标

    function Icon({ size = 20 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M8.6 3.2h6.8l4 4v9.2a4.4 4.4 0 0 1-4.4 4.4H8.6a4.4 4.4 0 0 1-4.4-4.4V7.6z' }),
        h('path', { d: 'M14.4 3.4v4.4h4.4' }),
        h('path', { d: 'M9 12.2h4.2M9 15.6h6' }),
      )
    }

    // ---------------------------------------------------------------- 编辑弹层

    function Editor({ initial, onClose, onSaved }) {
      const isNew = !initial?.id
      const [title, setTitle] = useState(initial?.title || '')
      const [body, setBody] = useState(initial?.body || '')
      const [tags, setTags] = useState((initial?.tags || []).join(' '))
      const [color, setColor] = useState(initial?.color || 'amber')
      const [busy, setBusy] = useState(false)
      const [refining, setRefining] = useState(false)
      const [error, setError] = useState('')
      const [note, setNote] = useState('')
      const bodyRef = useRef(null)

      const parseTags = useCallback(() => (
        tags.split(/[\s,，]+/).map((tag) => tag.replace(/^#+/, '').trim()).filter(Boolean).slice(0, 6)
      ), [tags])

      const submit = useCallback(async () => {
        if (busy) return
        if (!title.trim() && !body.trim()) {
          setError('标题和正文至少要有一个')
          return
        }
        setBusy(true)
        setError('')
        try {
          if (isNew) {
            await api('/add', {
              method: 'POST',
              body: { title: title.trim(), text: body.trim(), tags: parseTags(), color },
            })
          } else {
            await api('/update', {
              method: 'POST',
              body: { id: initial.id, title: title.trim(), body: body.trim(), tags: parseTags(), color },
            })
          }
          onSaved()
        } catch (caught) {
          setError(caught.message || String(caught))
        } finally {
          setBusy(false)
        }
      }, [busy, isNew, title, body, tags, color, initial, onSaved, parseTags])

      const refine = useCallback(async () => {
        if (refining) return
        if (!body.trim() && !title.trim()) {
          setError('先写点内容，AI 才有东西可整理')
          return
        }
        setRefining(true)
        setError('')
        setNote('')
        try {
          const data = await api('/refine', { method: 'POST', body: { text: [title, body].filter(Boolean).join('\n') } })
          const idea = data.idea || {}
          if (idea.title) setTitle(idea.title)
          if (idea.body) setBody(idea.body)
          if (Array.isArray(idea.tags) && idea.tags.length) setTags(idea.tags.join(' '))
          if (idea.color) setColor(idea.color)
          setNote(data.refined ? 'AI 整理好了，看看要不要再改' : 'AI 没整理成功，已按原文保留')
        } catch (caught) {
          setError(caught.message || String(caught))
        } finally {
          setRefining(false)
        }
      }, [refining, body, title])

      const remove = useCallback(async () => {
        if (!initial?.id || busy) return
        setBusy(true)
        setError('')
        try {
          await api('/remove', { method: 'POST', body: { id: initial.id } })
          onSaved()
        } catch (caught) {
          setError(caught.message || String(caught))
        } finally {
          setBusy(false)
        }
      }, [initial, busy, onSaved])

      useEffect(() => {
        if (isNew) bodyRef.current?.focus()
      }, [isNew])

      return h('div', { style: S.mask, onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
        h('div', { style: S.dialog },
          h('div', { style: { fontSize: '14px', fontWeight: 700 } }, isNew ? '贴一张新灵感' : '编辑便签'),
          h('div', null,
            h('div', { style: S.label }, '标题'),
            h('input', {
              style: S.input, value: title, placeholder: '一句话标题（可留空，AI 整理时会补）',
              onChange: (event) => setTitle(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit() },
            }),
          ),
          h('div', null,
            h('div', { style: S.label }, '正文 / 灵感原话'),
            h('textarea', {
              ref: bodyRef, style: S.textarea, value: body,
              placeholder: '想到什么写什么，不用排版。点「AI 整理」会让它变成标题 + 要点 + 标签。',
              onChange: (event) => setBody(event.target.value),
            }),
          ),
          h('div', { style: S.row }, h('div', { style: { ...S.label, margin: 0 } }, '标签'),
            h('input', {
              style: { ...S.input, flex: 1, minWidth: '180px' }, value: tags,
              placeholder: '空格或逗号分隔，例如：产品 想法 交互',
              onChange: (event) => setTags(event.target.value),
            }),
          ),
          h('div', { style: S.row }, h('div', { style: { ...S.label, margin: 0 } }, '纸色'),
            ...COLORS.map((name) => h('button', {
              key: name, type: 'button', title: PALETTE[name].name,
              style: S.dot(name, color === name), onClick: () => setColor(name),
            })),
          ),
          h('div', { style: S.row },
            h('button', { type: 'button', style: S.ghost, onClick: refine, disabled: refining }, refining ? '整理中…' : 'AI 整理'),
            h('span', { style: S.hint }, '把原文整理成标题 + 要点 + 标签'),
          ),
          note ? h('div', { style: S.ok }, note) : null,
          error ? h('div', { style: S.error }, error) : null,
          h('div', { style: S.sep }),
          h('div', { style: S.row },
            h('button', { type: 'button', style: S.primary, onClick: submit, disabled: busy }, busy ? '保存中…' : (isNew ? '贴上墙' : '保存')),
            h('button', { type: 'button', style: S.ghost, onClick: onClose }, '取消'),
            h('div', { style: { flex: 1 } }),
            isNew ? null : h('button', {
              type: 'button',
              style: { ...S.ghost, color: C.danger, borderColor: C.border },
              onClick: remove,
              disabled: busy,
            }, '撕掉'),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 设置弹层

    function Settings({ initial, onClose, onSaved }) {
      const [capture, setCapture] = useState(initial?.capture !== false)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      const save = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
          await api('/settings', { method: 'POST', body: { capture } })
          onSaved()
        } catch (caught) {
          setError(caught.message || String(caught))
        } finally {
          setBusy(false)
        }
      }, [capture, onSaved])

      const resolved = initial?.resolvedModel
      return h('div', { style: S.mask, onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
        h('div', { style: S.dialog },
          h('div', { style: { fontSize: '14px', fontWeight: 700 } }, '灵感墙设置'),
          h('div', { style: S.settingRow },
            h('div', null,
              h('div', null, '会话里自动捕获灵感'),
              h('div', { style: S.hint }, '你说「我有一个灵感……」时，插件自动总结并挂墙。关掉后仍可手动记，或让我用工具挂。'),
            ),
            h('button', {
              type: 'button', style: { ...S.ghost, fontWeight: 700, minWidth: '64px' },
              onClick: () => setCapture((value) => !value),
            }, capture ? '开' : '关'),
          ),
          h('div', { style: S.sep }),
          h('div', { style: S.hint },
            resolved
              ? `提炼模型：${resolved.provider} / ${resolved.model}`
              : '提炼模型：还没解析到默认模型（自动捕获会退回原文保存）',
          ),
          error ? h('div', { style: S.error }, error) : null,
          h('div', { style: S.row },
            h('button', { type: 'button', style: S.primary, onClick: save, disabled: busy }, busy ? '保存中…' : '保存'),
            h('button', { type: 'button', style: S.ghost, onClick: onClose }, '关闭'),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 墙页面

    function WallPage() {
      const [notes, setNotes] = useState([])
      const [tags, setTags] = useState([])
      const [query, setQuery] = useState('')
      const [activeTag, setActiveTag] = useState('')
      const [showArchived, setShowArchived] = useState(false)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [editor, setEditor] = useState(null) // null | 'new' | note
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [settings, setSettings] = useState(null)

      const load = useCallback(async () => {
        try {
          const [list, tagData] = await Promise.all([
            api(`/list${query ? `?q=${encodeURIComponent(query)}` : ''}${showArchived ? `${query ? '&' : '?'}archived=1` : ''}`),
            api('/tags'),
          ])
          setNotes(list.notes || [])
          setTags(tagData.tags || [])
          setError('')
        } catch (caught) {
          setError(caught.message || String(caught))
        } finally {
          setLoading(false)
        }
      }, [query, showArchived])

      useEffect(() => { load() }, [load])

      useEffect(() => {
        api('/settings').then((data) => setSettings(data.settings)).catch(() => {})
      }, [])

      const visible = useMemo(() => (
        activeTag ? notes.filter((note) => (note.tags || []).includes(activeTag)) : notes
      ), [notes, activeTag])

      const stats = useMemo(() => ({
        total: notes.length,
        pinned: notes.filter((note) => note.pinned).length,
      }), [notes])

      const patchNote = useCallback(async (id, patch) => {
        try {
          await api('/update', { method: 'POST', body: { id, ...patch } })
          await load()
        } catch (caught) {
          setError(caught.message || String(caught))
        }
      }, [load])

      const openSettings = useCallback(async () => {
        try {
          const data = await api('/settings')
          setSettings(data.settings)
        } catch { /* 设置拿不到也能打开 */ }
        setSettingsOpen(true)
      }, [])

      return h('div', { style: S.page },
        h('div', { style: S.inner },
          h('div', { style: S.top },
            h('div', null,
              h('div', { style: S.title }, '灵感墙'),
              h('div', { style: S.count }, `${stats.total} 张便签${stats.pinned ? ` · ${stats.pinned} 张置顶` : ''}`),
            ),
            h('div', { style: { flex: 1 } }),
            h('input', {
              style: S.search, value: query, placeholder: '搜标题 / 正文 / 标签',
              onChange: (event) => setQuery(event.target.value),
            }),
            h('button', { type: 'button', style: S.ghost, onClick: openSettings, title: '设置' }, '设置'),
            h('button', { type: 'button', style: S.primary, onClick: () => setEditor('new') }, '＋ 记一条'),
          ),
          h('div', { style: S.chips },
            h('button', { type: 'button', style: S.chip(!activeTag), onClick: () => setActiveTag('') }, '全部'),
            ...tags.map((tag) => h('button', {
              key: tag.name, type: 'button', style: S.chip(activeTag === tag.name),
              onClick: () => setActiveTag(activeTag === tag.name ? '' : tag.name),
            }, `#${tag.name} ${tag.count}`)),
            h('button', {
              type: 'button', style: { ...S.chip(showArchived), marginLeft: 'auto' },
              onClick: () => setShowArchived((value) => !value),
            }, showArchived ? '隐藏归档' : '看归档'),
          ),
          error ? h('div', { style: S.error }, error) : null,
          loading
            ? h('div', { style: S.empty }, '正在打开灵感墙…')
            : visible.length === 0
              ? h('div', { style: S.empty },
                  h('div', null, notes.length === 0 ? '墙上还是空的。' : '没有符合条件的便签。'),
                  h('div', null, '点右上角「＋ 记一条」贴一张；或者在会话里说一句「我有一个灵感……」，我会自动挂上来。'),
                )
              : h('div', { style: S.grid },
                  ...visible.map((note) => h('div', {
                    key: note.id,
                    style: { ...S.note, ...paper(note.color, note.pinned ? 22 : 16) },
                  },
                    h('div', { style: S.noteTitle }, note.title),
                    note.body ? h('div', { style: S.noteBody }, note.body) : null,
                    note.tags?.length ? h('div', { style: S.tags },
                      ...note.tags.map((tag) => h('button', {
                        key: tag, type: 'button', style: S.tag,
                        onClick: () => setActiveTag(tag),
                      }, `#${tag}`)),
                    ) : null,
                    h('div', { style: S.foot },
                      h('span', { style: S.time }, fmtTime(note.created)),
                      h('button', {
                        type: 'button', style: { ...S.mini, color: note.pinned ? C.text : C.faint },
                        title: note.pinned ? '取消置顶' : '置顶',
                        onClick: () => patchNote(note.id, { pinned: !note.pinned }),
                      }, note.pinned ? '★' : '☆'),
                      h('button', {
                        type: 'button', style: S.mini, title: note.archived ? '取消归档' : '归档',
                        onClick: () => patchNote(note.id, { archived: !note.archived }),
                      }, note.archived ? '↩' : '⌄'),
                      h('button', { type: 'button', style: S.mini, title: '编辑', onClick: () => setEditor(note) }, '✎'),
                    ),
                  )),
                ),
        ),
        editor ? h(Editor, {
          initial: editor === 'new' ? null : editor,
          onClose: () => setEditor(null),
          onSaved: () => { setEditor(null); load() },
        }) : null,
        settingsOpen ? h(Settings, {
          initial: settings,
          onClose: () => setSettingsOpen(false),
          onSaved: async () => { setSettingsOpen(false); try { const data = await api('/settings'); setSettings(data.settings) } catch { /* 忽略 */ } },
        }) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'idea-wall',
          order: 24,
          label: () => '灵感墙',
        }, Icon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'idea-wall',
        }, WallPage))
      },
    }
  },
})

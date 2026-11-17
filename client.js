// 灵感墙 · 页面（工作台 tab 与原生侧栏共用同一个组件）
//
// 交互反馈统一走注入的 CSS（hover / active / focus-visible），不靠内联样式；
// 图标一律 SVG，不用 ★ ☆ ✎ ＋ 这类字符。
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

    // 交互反馈的样式表：类名前缀 iw-，避开别的插件 [class*="controls"] 这类地雷。
    const CSS = `
      .iw-hit { transition: background-color 130ms ease, border-color 130ms ease, color 130ms ease, box-shadow 130ms ease, transform 130ms ease, opacity 130ms ease; }
      .iw-hit:active { transform: scale(0.97); }
      .iw-hit:focus-visible { outline: 2px solid var(--dsw-alias-border-selected); outline-offset: 2px; }
      .iw-hit[disabled] { opacity: 0.48; cursor: default; }
      .iw-hit[disabled]:active { transform: none; }

      .iw-primary { box-shadow: 0 1px 2px rgba(0,0,0,0.10); }
      .iw-primary:hover:not([disabled]) { opacity: 0.88; box-shadow: 0 3px 10px rgba(0,0,0,0.18); transform: translateY(-1px); }
      .iw-primary:active:not([disabled]) { opacity: 0.94; transform: translateY(0) scale(0.97); }

      .iw-ghost:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover) !important; border-color: var(--dsw-alias-border-selected) !important; }
      .iw-ghost:active:not([disabled]) { background: var(--dsw-alias-button-ghost-active-fill) !important; }

      .iw-pill:hover { background: var(--dsw-alias-interactive-bg-hover) !important; border-color: var(--dsw-alias-border-selected) !important; color: var(--dsw-alias-label-primary) !important; }
      .iw-pill:active { transform: scale(0.96); }

      .iw-card { transition: box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease; }
      .iw-card:hover { box-shadow: 0 8px 26px rgba(0,0,0,0.14); transform: translateY(-2px); border-color: var(--dsw-alias-border-selected) !important; }
      .iw-card:active { transform: translateY(-1px) scale(0.995); }

      .iw-mini:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover) !important; color: var(--dsw-alias-label-primary) !important; transform: scale(1.08); }
      .iw-mini:active:not([disabled]) { transform: scale(0.94); }
      .iw-mini[aria-pressed="true"] { color: var(--dsw-alias-label-primary) !important; }

      .iw-tag:hover { background: color-mix(in srgb, currentColor 14%, transparent) !important; border-color: var(--dsw-alias-border-selected) !important; color: var(--dsw-alias-label-primary) !important; }
      .iw-tag:active { transform: scale(0.96); }

      .iw-danger:hover:not([disabled]) { background: var(--dsw-alias-state-error-primary) !important; color: var(--dsw-alias-bg-base) !important; border-color: var(--dsw-alias-state-error-primary) !important; }

      .iw-dot { transition: transform 130ms ease, box-shadow 130ms ease; }
      .iw-dot:hover { transform: scale(1.14); box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent); }

      .iw-field { transition: border-color 130ms ease, box-shadow 130ms ease; }
      .iw-field:hover { border-color: var(--dsw-alias-border-selected) !important; }
      .iw-field:focus { border-color: var(--dsw-alias-border-selected) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-border-selected) 26%, transparent); }

      .iw-link { transition: color 130ms ease; cursor: pointer; }
      .iw-link:hover { color: var(--dsw-alias-label-primary) !important; }

      @media (prefers-reduced-motion: reduce) {
        .iw-hit, .iw-card, .iw-mini, .iw-dot, .iw-field, .iw-primary, .iw-pill, .iw-tag { transition: none !important; }
        .iw-card:hover, .iw-primary:hover:not([disabled]), .iw-dot:hover { transform: none !important; }
      }
    `

    const S = {
      page: { height: '100%', boxSizing: 'border-box', overflowY: 'auto', padding: '22px 26px 40px', color: C.text, background: C.input },
      inner: { maxWidth: '1180px', margin: '0 auto' },
      top: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' },
      title: { fontSize: '18px', fontWeight: 700, letterSpacing: '0.01em', marginRight: '4px' },
      count: { fontSize: '11.5px', color: C.faint, marginTop: '2px' },
      searchWrap: { position: 'relative', flex: '1 1 200px', minWidth: '170px', maxWidth: '340px', display: 'flex', alignItems: 'center' },
      searchIcon: { position: 'absolute', left: '10px', color: C.faint, pointerEvents: 'none', display: 'flex' },
      search: {
        width: '100%', boxSizing: 'border-box', paddingLeft: '32px',
        background: C.input, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: '9px', padding: '7px 11px 7px 32px', fontSize: '12.5px', outline: 'none',
      },
      primary: {
        border: `1px solid ${C.text}`, background: C.text, color: 'var(--dsw-alias-bg-base)',
        borderRadius: '9px', padding: '7px 13px 7px 11px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit',
      },
      ghost: {
        border: `1px solid ${C.border}`, background: 'transparent', color: C.text,
        borderRadius: '9px', padding: '7px 11px', fontSize: '12.5px', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit',
      },
      chips: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' },
      chip: (on) => ({
        border: `1px solid ${on ? C.strong : C.border}`,
        background: on ? C.ghost : 'transparent',
        color: on ? C.text : C.sub,
        borderRadius: '999px', padding: '4px 11px', fontSize: '12px', cursor: 'pointer',
        fontWeight: on ? 700 : 400, fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
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
        overflow: 'hidden', cursor: 'default',
      },
      noteTitle: { fontSize: '13.5px', fontWeight: 700, lineHeight: 1.45, wordBreak: 'break-word' },
      noteBody: { fontSize: '12px', lineHeight: 1.65, color: C.sub, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '170px', overflow: 'hidden' },
      tags: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
      tag: {
        fontSize: '10.5px', color: C.sub, background: 'color-mix(in srgb, currentColor 8%, transparent)',
        border: `1px solid ${C.border}`, borderRadius: '999px', padding: '1px 7px', cursor: 'pointer',
        fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '3px',
      },
      foot: { display: 'flex', alignItems: 'center', gap: '1px', marginTop: '2px' },
      time: { fontSize: '10.5px', color: C.faint, flex: 1 },
      mini: {
        border: 'transparent', background: 'transparent', color: C.faint, cursor: 'pointer',
        padding: '4px', borderRadius: '7px', lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
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
        width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer',
        background: PALETTE[color].ink, padding: 0, border: 'none', outline: 'none',
        boxShadow: on
          ? `0 0 0 2px ${C.input}, 0 0 0 4px ${C.text}`
          : `0 0 0 1px ${C.border}`,
      }),
      hint: { fontSize: '11px', color: C.faint, lineHeight: 1.7 },
      error: { fontSize: '12px', color: C.danger, minHeight: '16px' },
      ok: { fontSize: '12px', color: C.ok, minHeight: '16px' },
      sep: { height: '1px', background: C.border, margin: '2px 0' },
      settingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0' },
      toggle: (on) => ({
        width: '40px', height: '22px', borderRadius: '999px', cursor: 'pointer', padding: 0,
        border: `1px solid ${on ? C.strong : C.border}`,
        background: on ? C.text : C.surface,
        position: 'relative', flex: 'none',
      }),
      knob: (on) => ({
        position: 'absolute', top: '2px', left: on ? '20px' : '2px', width: '16px', height: '16px',
        borderRadius: '50%', background: on ? C.input : C.faint, transition: 'left 140ms ease',
      }),
      close: {
        border: 'transparent', background: 'transparent', color: C.faint, cursor: 'pointer',
        padding: '5px', borderRadius: '8px', display: 'inline-flex',
      },
    }

    // ---------------------------------------------------------------- 图标（全部 SVG）

    function Glyph({ size = 16, filled = false, children }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block', flex: 'none' },
      }, children)
    }

    function IconWall({ size = 20 }) {
      return h(Glyph, { size },
        h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
        h('path', { d: 'M7.5 7.5h4M7.5 12h9M7.5 16.5h6' }),
      )
    }

    function IconPin({ size = 14, filled = false }) {
      return h(Glyph, { size, filled }, h('path', { d: 'M7 4h10l-1 7 3 2.5V16H5v-2.5L8 11z' }), h('path', { d: 'M12 16v5' }))
    }

    function IconArchive({ size = 14 }) {
      return h(Glyph, { size },
        h('path', { d: 'M4 8h16v11H4z' }),
        h('path', { d: 'M3 4h18v4H3z' }),
        h('path', { d: 'M10 12h4' }),
      )
    }

    function IconUnarchive({ size = 14 }) {
      return h(Glyph, { size },
        h('path', { d: 'M4 8h16v11H4z' }),
        h('path', { d: 'M3 4h18v4H3z' }),
        h('path', { d: 'M12 17v-5M9.5 14l2.5-2.5 2.5 2.5' }),
      )
    }

    function IconEdit({ size = 14 }) {
      return h(Glyph, { size },
        h('path', { d: 'M4 20h4L19 9l-4-4L4 16z' }),
        h('path', { d: 'M13 7l4 4' }),
      )
    }

    function IconPlus({ size = 14 }) {
      return h(Glyph, { size }, h('path', { d: 'M12 5v14M5 12h14' }))
    }

    function IconSearch({ size = 14 }) {
      return h(Glyph, { size }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M20 20l-4.2-4.2' }))
    }

    function IconSettings({ size = 14 }) {
      return h(Glyph, { size },
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7' }),
      )
    }

    function IconTrash({ size = 14 }) {
      return h(Glyph, { size },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9 7V5h6v2' }),
        h('path', { d: 'M7 7l1 13h8l1-13' }),
        h('path', { d: 'M10 11v6M14 11v6' }),
      )
    }

    function IconTag({ size = 12 }) {
      return h(Glyph, { size },
        h('path', { d: 'M3.5 12.5V4h8.5l8 8-8 8z' }),
        h('circle', { cx: 8, cy: 8, r: 1.2, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function IconSpark({ size = 14 }) {
      return h(Glyph, { size }, h('path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }))
    }

    // ---------------------------------------------------------------- 数据

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
        h('div', { style: S.dialog, role: 'dialog', 'aria-label': isNew ? '贴一张新灵感' : '编辑便签' },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('div', { style: { fontSize: '14px', fontWeight: 700 } }, isNew ? '贴一张新灵感' : '编辑便签'),
            h('button', { type: 'button', className: 'iw-hit', style: S.close, onClick: onClose, title: '关闭', 'aria-label': '关闭' },
              h(Glyph, { size: 16 }, h('path', { d: 'M6 6l12 12M18 6L6 18' }))),
          ),
          h('div', null,
            h('div', { style: S.label }, '标题'),
            h('input', {
              className: 'iw-field', style: S.input, value: title, placeholder: '一句话标题（可留空，AI 整理时会补）',
              onChange: (event) => setTitle(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit() },
            }),
          ),
          h('div', null,
            h('div', { style: S.label }, '正文 / 灵感原话'),
            h('textarea', {
              ref: bodyRef, className: 'iw-field', style: S.textarea, value: body,
              placeholder: '想到什么写什么，不用排版。点「AI 整理」会让它变成标题 + 要点 + 标签。',
              onChange: (event) => setBody(event.target.value),
            }),
          ),
          h('div', { style: S.row }, h('div', { style: { ...S.label, margin: 0 } }, '标签'),
            h('input', {
              className: 'iw-field', style: { ...S.input, flex: 1, minWidth: '180px' }, value: tags,
              placeholder: '空格或逗号分隔，例如：产品 想法 交互',
              onChange: (event) => setTags(event.target.value),
            }),
          ),
          h('div', { style: S.row }, h('div', { style: { ...S.label, margin: 0 } }, '纸色'),
            ...COLORS.map((name) => h('button', {
              key: name, type: 'button', title: PALETTE[name].name, 'aria-label': `${PALETTE[name].name}纸色`,
              'aria-pressed': color === name,
              className: 'iw-dot', style: S.dot(name, color === name), onClick: () => setColor(name),
            })),
          ),
          h('div', { style: S.row },
            h('button', { type: 'button', className: 'iw-hit iw-ghost', style: S.ghost, onClick: refine, disabled: refining },
              h(IconSpark, { size: 14 }), refining ? '整理中…' : 'AI 整理'),
            h('span', { style: S.hint }, '把原文整理成标题 + 要点 + 标签'),
          ),
          note ? h('div', { style: S.ok }, note) : null,
          error ? h('div', { style: S.error }, error) : null,
          h('div', { style: S.sep }),
          h('div', { style: S.row },
            h('button', { type: 'button', className: 'iw-hit iw-primary', style: S.primary, onClick: submit, disabled: busy },
              h(Glyph, { size: 14 }, h('path', { d: 'M5 12l5 5L19 7' })),
              busy ? '保存中…' : (isNew ? '贴上墙' : '保存')),
            h('button', { type: 'button', className: 'iw-hit iw-ghost', style: S.ghost, onClick: onClose }, '取消'),
            h('div', { style: { flex: 1 } }),
            isNew ? null : h('button', {
              type: 'button',
              className: 'iw-hit iw-ghost iw-danger',
              style: { ...S.ghost, color: C.danger },
              onClick: remove,
              disabled: busy,
            }, h(IconTrash, { size: 14 }), '撕掉'),
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
        h('div', { style: S.dialog, role: 'dialog', 'aria-label': '灵感墙设置' },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            h('div', { style: { fontSize: '14px', fontWeight: 700 } }, '灵感墙设置'),
            h('button', { type: 'button', className: 'iw-hit', style: S.close, onClick: onClose, title: '关闭', 'aria-label': '关闭' },
              h(Glyph, { size: 16 }, h('path', { d: 'M6 6l12 12M18 6L6 18' }))),
          ),
          h('div', { style: S.settingRow },
            h('div', null,
              h('div', null, '会话里自动捕获灵感'),
              h('div', { style: S.hint }, '你说「我有一个灵感……」时，插件自动总结并挂墙。关掉后仍可手动记，或让我用工具挂。'),
            ),
            h('button', {
              type: 'button', className: 'iw-hit', role: 'switch', 'aria-checked': capture,
              style: S.toggle(capture), onClick: () => setCapture((value) => !value),
            }, h('span', { style: S.knob(capture) })),
          ),
          h('div', { style: S.sep }),
          h('div', { style: S.hint },
            resolved
              ? `提炼模型：${resolved.provider} / ${resolved.model}`
              : '提炼模型：还没解析到默认模型（自动捕获会退回原文保存）',
          ),
          error ? h('div', { style: S.error }, error) : null,
          h('div', { style: S.row },
            h('button', { type: 'button', className: 'iw-hit iw-primary', style: S.primary, onClick: save, disabled: busy },
              h(Glyph, { size: 14 }, h('path', { d: 'M5 12l5 5L19 7' })),
              busy ? '保存中…' : '保存'),
            h('button', { type: 'button', className: 'iw-hit iw-ghost', style: S.ghost, onClick: onClose }, '关闭'),
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
          const params = new URLSearchParams()
          if (query) params.set('q', query)
          if (showArchived) params.set('archived', '1')
          const suffix = params.toString()
          const [list, tagData] = await Promise.all([
            api(`/list${suffix ? `?${suffix}` : ''}`),
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
            h('div', { style: S.searchWrap },
              h('span', { style: S.searchIcon }, h(IconSearch, { size: 14 })),
              h('input', {
                className: 'iw-field', style: S.search, value: query, placeholder: '搜标题 / 正文 / 标签',
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            h('button', { type: 'button', className: 'iw-hit iw-ghost', style: S.ghost, onClick: openSettings, title: '设置' },
              h(IconSettings, { size: 14 }), '设置'),
            h('button', { type: 'button', className: 'iw-hit iw-primary', style: S.primary, onClick: () => setEditor('new') },
              h(IconPlus, { size: 14 }), '记一条'),
          ),
          h('div', { style: S.chips },
            h('button', { type: 'button', className: 'iw-hit iw-pill', style: S.chip(!activeTag), onClick: () => setActiveTag('') }, '全部'),
            ...tags.map((tag) => h('button', {
              key: tag.name, type: 'button', className: 'iw-hit iw-pill',
              style: S.chip(activeTag === tag.name),
              onClick: () => setActiveTag(activeTag === tag.name ? '' : tag.name),
            }, h(IconTag, { size: 11 }), `${tag.name}`, h('span', { style: { color: C.faint, marginLeft: '1px' } }, tag.count))),
            h('button', {
              type: 'button', className: 'iw-hit iw-ghost', style: { ...S.chip(showArchived), marginLeft: 'auto' },
              onClick: () => setShowArchived((value) => !value),
            }, showArchived ? h(IconUnarchive, { size: 13 }) : h(IconArchive, { size: 13 }), showArchived ? '隐藏归档' : '看归档'),
          ),
          error ? h('div', { style: S.error }, error) : null,
          loading
            ? h('div', { style: S.empty }, '正在打开灵感墙…')
            : visible.length === 0
              ? h('div', { style: S.empty },
                  h('div', null, notes.length === 0 ? '墙上还是空的。' : '没有符合条件的便签。'),
                  h('div', null, '点右上角「记一条」贴一张；或者在会话里说一句「我有一个灵感……」，我会自动挂上来。'),
                )
              : h('div', { style: S.grid },
                  ...visible.map((note) => h('div', {
                    key: note.id,
                    className: 'iw-card',
                    style: { ...S.note, ...paper(note.color, note.pinned ? 22 : 16) },
                  },
                    h('div', { style: S.noteTitle }, note.title),
                    note.body ? h('div', { style: S.noteBody }, note.body) : null,
                    note.tags?.length ? h('div', { style: S.tags },
                      ...note.tags.map((tag) => h('button', {
                        key: tag, type: 'button', className: 'iw-hit iw-tag', style: S.tag,
                        title: `只看 #${tag}`,
                        onClick: () => setActiveTag(tag),
                      }, h(IconTag, { size: 10 }), tag)),
                    ) : null,
                    h('div', { style: S.foot },
                      h('span', { style: S.time }, fmtTime(note.created)),
                      h('button', {
                        type: 'button', className: 'iw-hit iw-mini',
                        style: S.mini,
                        title: note.pinned ? '取消置顶' : '置顶',
                        'aria-label': note.pinned ? '取消置顶' : '置顶',
                        'aria-pressed': Boolean(note.pinned),
                        onClick: () => patchNote(note.id, { pinned: !note.pinned }),
                      }, h(IconPin, { size: 14, filled: Boolean(note.pinned) })),
                      h('button', {
                        type: 'button', className: 'iw-hit iw-mini',
                        style: S.mini,
                        title: note.archived ? '取消归档' : '归档',
                        'aria-label': note.archived ? '取消归档' : '归档',
                        onClick: () => patchNote(note.id, { archived: !note.archived }),
                      }, note.archived ? h(IconUnarchive, { size: 14 }) : h(IconArchive, { size: 14 })),
                      h('button', {
                        type: 'button', className: 'iw-hit iw-mini',
                        style: S.mini, title: '编辑', 'aria-label': '编辑便签',
                        onClick: () => setEditor(note),
                      }, h(IconEdit, { size: 14 })),
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
          onSaved: async () => {
            setSettingsOpen(false)
            try { const data = await api('/settings'); setSettings(data.settings) } catch { /* 忽略 */ }
          },
        }) : null,
      )
    }

    // ---------------------------------------------------------------- 注册

    return {
      inject: ['slots'],
      apply(ctx) {
        // 交互反馈的样式表：只注入一次，卸载时移除。
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshIdeaWall = 'styles'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'idea-wall: styles')

        let timer = 0
        let disposed = false
        let decided = false

        // 装了工作台：进顶部第二行的模块 tab（应用级页面归模块栏）。
        const registerWorkbench = () => {
          const wb = ctx.get('workbench')
          if (!wb || wb.apiVersion !== 1) return false
          ctx.effect(() => wb.registerView({
            id: 'idea-wall',
            title: '灵感墙',
            icon: IconWall,
            component: WallPage,
            order: 70,
          }), 'idea-wall: workbench view')
          return true
        }

        // 没装工作台：退回原生侧栏入口 + 主面板。
        const registerSidebar = () => {
          ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'idea-wall',
            order: 24,
            label: () => '灵感墙',
          }, IconWall)), 'idea-wall: sidebar entry')

          ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: 'idea-wall',
          }, WallPage)), 'idea-wall: main view')
        }

        const decide = () => {
          if (disposed || decided) return
          if (registerWorkbench()) {
            decided = true
            return
          }
          // 工作台插件的 load 和本插件同为 immediately，服务可能晚几十毫秒才 provide。
          if (tries >= 8) {
            decided = true
            registerSidebar()
            return
          }
          tries += 1
          timer = setTimeout(decide, 150)
        }

        let tries = 0
        decide()

        ctx.effect(() => () => {
          disposed = true
          clearTimeout(timer)
        }, 'idea-wall: pending entry')
      },
    }
  },
})

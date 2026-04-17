import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  loadState,
  saveState,
  putImage,
  getImage,
  deleteImage,
  fileToBase64,
  newImageId,
  pruneOrphans,
} from './storage.js'
import { getSystemPrompt } from './systemPrompts.js'

const MODEL = 'claude-opus-4-7'
const MAX_TOKENS = 1500
const API_URL = 'https://api.anthropic.com/v1/messages'

const SUBJECTS = {
  geology: { label: 'Geology', accentVar: '--ochre' },
  geography: { label: 'Geography', accentVar: '--lapis' },
}

export default function App() {
  const [state, setState] = useState(() => loadState())
  const { subject, histories, pinned } = state

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [pinnedThumbs, setPinnedThumbs] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    document.body.dataset.subject = subject
  }, [subject])

  useEffect(() => {
    let cancelled = false
    async function loadThumbs() {
      const ids = new Set([
        ...(pinned.geology || []).map((p) => p.id),
        ...(pinned.geography || []).map((p) => p.id),
      ])
      const next = {}
      for (const id of ids) {
        if (pinnedThumbs[id]) {
          next[id] = pinnedThumbs[id]
          continue
        }
        const rec = await getImage(id)
        if (rec) next[id] = `data:${rec.mediaType};base64,${rec.base64}`
      }
      if (!cancelled) setPinnedThumbs(next)
    }
    loadThumbs()
    return () => {
      cancelled = true
    }
  }, [pinned])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [histories, subject, loading])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'
  }, [input])

  const history = histories[subject]
  const pinnedForSubject = pinned[subject]

  function setSubject(next) {
    if (next === subject) return
    setError('')
    setAttachments([])
    setInput('')
    setState((s) => ({ ...s, subject: next }))
  }

  async function handleAttach(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    const additions = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await fileToBase64(file)
      const id = newImageId()
      await putImage({ id, base64, mediaType: file.type })
      additions.push({ id, mediaType: file.type, preview: `data:${file.type};base64,${base64}` })
    }
    setAttachments((a) => [...a, ...additions])
  }

  function removeAttachment(id) {
    setAttachments((a) => a.filter((att) => att.id !== id))
    deleteImage(id).catch(() => {})
  }

  function pinAttachment(att) {
    setState((s) => {
      if (s.pinned[subject].some((p) => p.id === att.id)) return s
      return {
        ...s,
        pinned: {
          ...s.pinned,
          [subject]: [...s.pinned[subject], { id: att.id, mediaType: att.mediaType }],
        },
      }
    })
    setPinnedThumbs((t) => ({ ...t, [att.id]: att.preview }))
    setAttachments((a) => a.filter((x) => x.id !== att.id))
  }

  async function unpinImage(id) {
    setState((s) => ({
      ...s,
      pinned: {
        ...s.pinned,
        [subject]: s.pinned[subject].filter((p) => p.id !== id),
      },
    }))
    const stillReferenced = isReferenced(id, { ...state, pinned: { ...state.pinned, [subject]: state.pinned[subject].filter((p) => p.id !== id) } })
    if (!stillReferenced) {
      deleteImage(id).catch(() => {})
      setPinnedThumbs((t) => {
        const n = { ...t }
        delete n[id]
        return n
      })
    }
  }

  async function clearConversation() {
    if (!confirm(`Clear the entire ${SUBJECTS[subject].label} conversation and unpin all items?`)) return
    setState((s) => ({
      ...s,
      histories: { ...s.histories, [subject]: [] },
      pinned: { ...s.pinned, [subject]: [] },
    }))
    setAttachments([])
    setInput('')
    setError('')
    const remaining = collectReferencedIds({
      ...state,
      histories: { ...state.histories, [subject]: [] },
      pinned: { ...state.pinned, [subject]: [] },
    })
    await pruneOrphans(remaining)
    setPinnedThumbs({})
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setError('')
    const imageRefs = attachments.map(({ id, mediaType }) => ({ id, mediaType }))
    const userMsg = { role: 'user', text, imageRefs }
    const nextHistory = [...history, userMsg]
    setState((s) => ({ ...s, histories: { ...s.histories, [subject]: nextHistory } }))
    setInput('')
    setAttachments([])
    setLoading(true)
    try {
      const pendingState = {
        ...state,
        histories: { ...state.histories, [subject]: nextHistory },
      }
      const messages = await buildApiMessagesFrom(pendingState)
      const reply = await callClaudeFrom(pendingState, messages)
      setState((s) => ({
        ...s,
        histories: {
          ...s.histories,
          [subject]: [...s.histories[subject], { role: 'assistant', text: reply }],
        },
      }))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function buildApiMessagesFrom(snap) {
    const h = snap.histories[snap.subject]
    const pins = snap.pinned[snap.subject]
    const messages = []
    let firstUser = true
    for (const msg of h) {
      if (msg.role === 'user') {
        const content = []
        if (firstUser && pins.length > 0) {
          for (const pin of pins) {
            const rec = await getImage(pin.id)
            if (rec) {
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: rec.mediaType, data: rec.base64 },
              })
            }
          }
          content.push({
            type: 'text',
            text: `[Pinned context: ${pins.length} textbook screenshot(s) attached above. Treat these as authoritative reference material for terminology and framing throughout this conversation.]`,
          })
          firstUser = false
        }
        for (const ref of msg.imageRefs || []) {
          const rec = await getImage(ref.id)
          if (rec) {
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: rec.mediaType, data: rec.base64 },
            })
          }
        }
        content.push({ type: 'text', text: msg.text })
        messages.push({ role: 'user', content })
      } else {
        messages.push({ role: 'assistant', content: msg.text })
      }
    }
    return messages
  }

  async function callClaudeFrom(snap, messages) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'No API key found. Copy .env.example to .env.local and paste your Anthropic API key.'
      )
    }
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: getSystemPrompt(snap.subject),
        messages,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body.slice(0, 400)}`)
    }
    const data = await res.json()
    return (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <StrataMark />
          <div className="brand-text">
            <h1>Geology and Geography Master</h1>
            <p className="tagline">A personal study companion</p>
          </div>
        </div>
        <button className="ghost-btn" onClick={clearConversation} disabled={!history.length && !pinnedForSubject.length}>
          Clear
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {Object.entries(SUBJECTS).map(([key, meta]) => (
          <button
            key={key}
            role="tab"
            aria-selected={subject === key}
            className={`tab ${subject === key ? 'tab-active' : ''} tab-${key}`}
            onClick={() => setSubject(key)}
          >
            {meta.label}
          </button>
        ))}
      </nav>

      {pinnedForSubject.length > 0 && (
        <div className="pinned-strip">
          <span className="pinned-label">Pinned context</span>
          <div className="pinned-items">
            {pinnedForSubject.map((pin) => (
              <div key={pin.id} className="pinned-item">
                {pinnedThumbs[pin.id] ? (
                  <img src={pinnedThumbs[pin.id]} alt="pinned" />
                ) : (
                  <div className="thumb-placeholder" />
                )}
                <button
                  className="unpin-btn"
                  aria-label="Unpin"
                  onClick={() => unpinImage(pin.id)}
                  title="Unpin"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="chat" ref={scrollRef}>
        {history.length === 0 ? (
          <Welcome subject={subject} hasPins={pinnedForSubject.length > 0} />
        ) : (
          history.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
        {loading && <TypingIndicator />}
        {error && <div className="error">{error}</div>}
      </main>

      <footer className="composer">
        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((att) => (
              <div key={att.id} className="attachment">
                <img src={att.preview} alt="attachment" />
                <button
                  className="pin-star"
                  onClick={() => pinAttachment(att)}
                  title="Pin as session context"
                  aria-label="Pin"
                >
                  ★
                </button>
                <button
                  className="attachment-remove"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-row">
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach images"
            aria-label="Attach"
          >
            ＋
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleAttach}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Ask a ${SUBJECTS[subject].label.toLowerCase()} question…  (Shift+Enter for newline)`}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={send}
            disabled={!input.trim() || loading}
            title="Send (Enter)"
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-body">
          {msg.imageRefs?.length > 0 && (
            <div className="msg-images">
              {msg.imageRefs.map((ref) => (
                <InlineImage key={ref.id} imageRef={ref} />
              ))}
            </div>
          )}
          <div className="msg-text">{msg.text}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="msg msg-assistant">
      <div className="msg-body markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
      </div>
    </div>
  )
}

function InlineImage({ imageRef }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    getImage(imageRef.id).then((rec) => {
      if (alive && rec) setSrc(`data:${rec.mediaType};base64,${rec.base64}`)
    })
    return () => {
      alive = false
    }
  }, [imageRef.id])
  if (!src) return <div className="thumb-placeholder" />
  return <img src={src} alt="attachment" />
}

function TypingIndicator() {
  return (
    <div className="msg msg-assistant">
      <div className="typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  )
}

function Welcome({ subject, hasPins }) {
  const label = SUBJECTS[subject].label
  return (
    <div className="welcome">
      <StrataMark large />
      <h2>Ready to study {label.toLowerCase()}.</h2>
      <p>
        Ask anything at advanced-undergrad depth. Attach textbook screenshots and <strong>pin</strong> them with
        the ★ button to keep a chapter in context across every question you ask.
      </p>
      {hasPins && <p className="welcome-note">Pinned context active — your screenshots will travel with the first question of this session.</p>}
    </div>
  )
}

function StrataMark({ large }) {
  const size = large ? 72 : 34
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M4 18 Q 20 12, 32 16 T 60 14" stroke="var(--mark-1)" strokeWidth="3" fill="none" />
      <path d="M4 30 Q 22 26, 34 30 T 60 28" stroke="var(--mark-2)" strokeWidth="3" fill="none" />
      <path d="M4 42 Q 18 38, 30 42 T 60 40" stroke="var(--mark-3)" strokeWidth="3" fill="none" />
      <path d="M4 52 Q 24 48, 36 52 T 60 50" stroke="var(--mark-4)" strokeWidth="3" fill="none" />
    </svg>
  )
}

function collectReferencedIds(snap) {
  const ids = new Set()
  for (const pin of snap.pinned.geology || []) ids.add(pin.id)
  for (const pin of snap.pinned.geography || []) ids.add(pin.id)
  for (const msg of snap.histories.geology || []) {
    for (const ref of msg.imageRefs || []) ids.add(ref.id)
  }
  for (const msg of snap.histories.geography || []) {
    for (const ref of msg.imageRefs || []) ids.add(ref.id)
  }
  return [...ids]
}

function isReferenced(id, snap) {
  if (snap.pinned.geology?.some((p) => p.id === id)) return true
  if (snap.pinned.geography?.some((p) => p.id === id)) return true
  for (const msg of snap.histories.geology || []) {
    if (msg.imageRefs?.some((r) => r.id === id)) return true
  }
  for (const msg of snap.histories.geography || []) {
    if (msg.imageRefs?.some((r) => r.id === id)) return true
  }
  return false
}

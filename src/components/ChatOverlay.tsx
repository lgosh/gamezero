import React, { useState, useEffect, useRef } from 'react'

export interface ChatMsg {
  id: string
  nickname: string
  text: string
  ts: number
}

interface ChatOverlayProps {
  messages: ChatMsg[]
  onSend: (text: string) => void
  disabled?: boolean // true when paused / crashed
}

export default function ChatOverlay({ messages, onSend, disabled }: ChatOverlayProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  // Focus input when opening
  useEffect(() => {
    if (open) {
      // Exit pointer lock so mouse cursor is visible for typing
      if (document.pointerLockElement) document.exitPointerLock()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // T = open chat, Escape = close chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.code === 'KeyT' && !open) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.code === 'Escape' && open) {
        e.stopPropagation() // don't let this trigger pause
        setOpen(false)
        setInput('')
      }
    }
    document.addEventListener('keydown', onKey, true) // capture phase — before InputManager
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, disabled])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (text) onSend(text)
    setInput('')
    setOpen(false)
  }

  const recent = messages.slice(-50)

  return (
    <div className="absolute bottom-[340px] left-4 w-80 pointer-events-none select-none">
      {/* Message history */}
      <div
        ref={listRef}
        className="flex flex-col gap-[3px] mb-2 max-h-44 overflow-y-hidden"
      >
        {recent.map((msg, i) => (
          <div
            key={i}
            className="text-[13px] font-mono leading-snug"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,1), 1px 0 4px rgba(0,0,0,1)' }}
          >
            <span className="text-yellow-300 font-bold">{msg.nickname}</span>
            <span className="text-white/90">: {msg.text}</span>
          </div>
        ))}
      </div>

      {/* Input box */}
      {open && (
        <form onSubmit={submit} className="pointer-events-auto">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.stopPropagation()} // don't let game pick up typed chars
            placeholder="Say something… (Enter to send)"
            maxLength={200}
            autoComplete="off"
            className="w-full px-3 py-2 text-[13px] font-mono text-white rounded outline-none border border-white/25"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          />
        </form>
      )}

    </div>
  )
}

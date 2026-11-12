'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Floating feedback widget shown on every dashboard page (mounted once in the dashboard layout).
// Bottom-right so it never collides with page headers/actions; sits above the mobile tab bar.
// Captures the current page path automatically so bugs are easy to trace back.

type FeedbackType = 'bug' | 'idea' | 'other'

const TYPE_OPTS: { value: FeedbackType; label: string; icon: string; placeholder: string }[] = [
  { value: 'bug', label: 'Bug', icon: '🐛', placeholder: 'What went wrong? What were you doing when it happened?' },
  { value: 'idea', label: 'Idea', icon: '💡', placeholder: 'What would make Cultivate better for you?' },
  { value: 'other', label: 'Other', icon: '💬', placeholder: 'Anything you want to tell us…' },
]

export default function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Focus the textarea when the modal opens; restore focus to the trigger on close.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
    triggerRef.current?.focus()
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function reset() {
    setType('bug'); setMessage(''); setStatus('idle'); setErrorMsg('')
  }
  function close() {
    setOpen(false)
    // Delay reset so the closing state isn't visible mid-animation.
    setTimeout(reset, 150)
  }

  async function submit() {
    if (!message.trim() || status === 'sending') return
    setStatus('sending'); setErrorMsg('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          pagePath: pathname,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong.')
      }
      setStatus('sent')
      setTimeout(close, 1400)
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  return (
    <>
      {/* Floating trigger — bottom-right, above the mobile bottom nav (bottom-20), lower on desktop. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="print:hidden fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6
                   inline-flex items-center gap-2 rounded-full bg-green-700 hover:bg-green-600
                   text-white text-sm font-semibold pl-3.5 pr-4 py-2.5 shadow-lg
                   transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-surface"
      >
        <span aria-hidden="true" className="text-base leading-none">💬</span>
        Feedback
      </button>

      {open && (
        // Backdrop click-to-dismiss is a pointer convenience; keyboard users close
        // via the × button or Escape (handled above), so the overlay is presentational.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:px-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="bg-card border border-line-strong w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
          >
            {status === 'sent' ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3" aria-hidden="true">🌱</div>
                <h2 className="text-lg font-bold text-content">Thank you!</h2>
                <p className="text-muted text-sm mt-1">We got it — this really helps.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 id="feedback-title" className="text-lg font-bold text-content">Send feedback</h2>
                  <button
                    type="button" onClick={close} aria-label="Close feedback"
                    className="text-subtle hover:text-content text-xl leading-none transition-colors"
                  >×</button>
                </div>

                {/* Type picker */}
                <div className="flex gap-2 mb-4" role="group" aria-label="Feedback type">
                  {TYPE_OPTS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      aria-pressed={type === opt.value}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        type === opt.value
                          ? 'border-green-600 bg-green-600/10 text-content'
                          : 'border-line text-muted hover:border-line-strong'
                      }`}
                    >
                      <span aria-hidden="true">{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>

                <label htmlFor="feedback-message" className="sr-only">Your feedback</label>
                <textarea
                  id="feedback-message"
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder={TYPE_OPTS.find((o) => o.value === type)?.placeholder}
                  className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2.5 text-sm text-content
                             placeholder:text-subtle focus:outline-none focus:border-green-600 resize-none"
                />

                <p className="text-xs text-subtle mt-2">
                  We&rsquo;ll include the page you&rsquo;re on (<span className="font-mono">{pathname}</span>) so we can find it fast.
                </p>

                {status === 'error' && (
                  <p className="text-xs text-red-500 mt-2" role="alert">{errorMsg}</p>
                )}

                <div className="flex items-center justify-end gap-3 mt-5">
                  <button
                    type="button" onClick={close}
                    className="text-subtle hover:text-content text-sm transition-colors"
                  >Cancel</button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!message.trim() || status === 'sending'}
                    className="bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed
                               text-white font-semibold text-sm rounded-xl px-5 py-2.5 transition-colors"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

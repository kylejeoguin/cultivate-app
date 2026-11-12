'use client'

import { useState } from 'react'

export default function ExportDataButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleExport() {
    setStatus('loading')
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cultivate-my-data-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 4000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={status === 'loading'}
        className="inline-flex items-center gap-2 border border-line-strong bg-elevated hover:bg-card text-content text-sm font-medium px-4 h-10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'loading' && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-muted border-t-transparent rounded-full animate-spin" />
        )}
        {status === 'done' && <span className="text-green-600 dark:text-green-400">✓</span>}
        {status === 'error' && <span className="text-red-600 dark:text-red-400">✗</span>}
        {status === 'idle' && <span>↓</span>}

        {status === 'idle' && 'Download all my data'}
        {status === 'loading' && 'Preparing your workbook…'}
        {status === 'done' && 'Downloaded — check your downloads folder'}
        {status === 'error' && 'Export failed — try again'}
      </button>
      <p className="text-xs text-subtle">
        Downloads an Excel workbook (.xlsx) with a tab for every part of your account — homeschool, homestead, and home &amp; DIY. Opens in Excel, Google Sheets, or Numbers. Yours to keep.
      </p>
    </div>
  )
}

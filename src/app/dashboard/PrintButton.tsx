'use client'

// The single Print / Save-as-PDF button used on every report + transcript page. Solid,
// theme-aware surface so it reads the same in light AND dark (and on the always-white
// print-preview bars) — no translucency, always legible. Hidden when actually printing.
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 text-sm font-medium text-content bg-elevated hover:bg-line-strong border border-line-strong px-3 py-1.5 rounded-lg transition-colors"
    >
      🖨 Print / PDF
    </button>
  )
}

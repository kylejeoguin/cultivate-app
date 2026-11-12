import type { ReactNode } from 'react'

// Wraps a report's printable content so that, when printed, a REAL <thead>/<tfoot> spacer
// repeats on every sheet — giving page 2, 3, … a top+bottom margin regardless of the print
// dialog's "Margins" setting (a CSS pseudo-element header group does NOT repeat; a real one
// does). On screen the whole wrapper is display:contents (see globals.css .print-frame), so
// the content lays out exactly as if this wrapper weren't here. The table also provides the
// left/right margin in print (centered, page − 1in). Left/right/top/bottom all covered.
export default function PrintFrame({ children }: { children: ReactNode }) {
  return (
    <table className="print-frame">
      <thead>
        <tr><td /></tr>
      </thead>
      <tbody>
        <tr><td>{children}</td></tr>
      </tbody>
      <tfoot>
        <tr><td /></tr>
      </tfoot>
    </table>
  )
}

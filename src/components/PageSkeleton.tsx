// Generic instant-loading skeleton for dashboard leaf routes (history, reports,
// livestock, etc.). Next App Router shows this via a route's loading.tsx the moment
// navigation starts, while the server component fetches — so a heavy page never blanks
// or blocks on an already-mounted layout. Shape is intentionally generic (nav bar +
// title + a primary block + a card grid); exact width doesn't matter for a transient
// placeholder. cacheComponents is OFF, so this loading.tsx pattern is the supported
// perceived-speed lever (see node_modules/next/.../file-conventions/loading.md).
export default function PageSkeleton() {
  return (
    <div className="min-h-screen bg-surface text-content">
      {/* breadcrumb / nav bar */}
      <div className="border-b border-line/60 px-6 py-4 h-14" />
      <div className="max-w-5xl mx-auto px-6 py-8 animate-pulse">
        <div className="h-7 bg-elevated rounded-lg w-48 mb-2" />
        <div className="h-4 bg-elevated/60 rounded w-64 mb-8" />
        <div className="h-16 bg-card/60 border border-line/60 rounded-xl mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card/60 border border-line rounded-xl h-28" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-12 bg-card/60 rounded-lg" />
          <div className="h-12 bg-card/60 rounded-lg" />
          <div className="h-12 bg-card/60 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

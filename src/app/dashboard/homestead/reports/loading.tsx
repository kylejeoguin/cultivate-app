export default function HomesteadReportsLoading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <div className="h-4 w-24 bg-elevated rounded" />
        <div className="h-4 w-3 bg-elevated rounded" />
        <div className="h-4 w-16 bg-elevated rounded" />
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
        {/* Header */}
        <div>
          <div className="h-7 w-52 bg-elevated rounded-lg mb-2" />
          <div className="h-4 w-64 bg-elevated/60 rounded" />
        </div>

        {/* Livestock section */}
        <div className="space-y-4">
          <div className="h-3 w-20 bg-elevated/60 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-card/60 rounded-xl" />
            ))}
          </div>
          <div className="h-24 bg-card/60 rounded-xl" />
        </div>

        {/* Garden section */}
        <div className="space-y-4">
          <div className="h-3 w-16 bg-elevated/60 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-card/60 rounded-xl" />
            ))}
          </div>
          <div className="h-32 bg-card/60 rounded-xl" />
          <div className="h-24 bg-card/60 rounded-xl" />
        </div>

        {/* Preservation section */}
        <div className="space-y-4">
          <div className="h-3 w-32 bg-elevated/60 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-card/60 rounded-xl" />
            ))}
          </div>
          <div className="h-40 bg-card/60 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

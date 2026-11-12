export default function HomeDiyReportsLoading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4 flex items-center gap-3">
        <div className="h-4 w-20 bg-elevated rounded" />
        <div className="h-4 w-4 bg-elevated rounded" />
        <div className="h-4 w-16 bg-elevated rounded" />
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div>
          <div className="h-7 w-52 bg-elevated rounded-lg mb-2" />
          <div className="h-4 w-72 bg-elevated/60 rounded" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card/60 border border-line rounded-xl p-4 h-20" />
          ))}
        </div>

        {/* Alert block */}
        <div className="h-20 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-xl" />

        {/* Schedule section label */}
        <div className="h-3 w-44 bg-elevated/60 rounded" />

        {/* Schedule cards */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card/60 border border-line rounded-xl p-4 h-20" />
          ))}
        </div>

        {/* Category breakdown */}
        <div className="bg-card/60 border border-line rounded-xl p-4 space-y-3">
          <div className="h-3 w-36 bg-elevated/60 rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-24 bg-elevated/60 rounded" />
              <div className="flex-1 h-1.5 bg-elevated rounded-full" />
              <div className="h-3 w-4 bg-elevated/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomeschoolLoading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-20 bg-elevated rounded" />
          <div className="h-4 w-20 bg-elevated rounded" />
        </div>
        <div className="h-3 w-24 bg-elevated/60 rounded" />
      </div>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="h-7 w-40 bg-elevated rounded-lg mb-2" />
        <div className="h-4 w-32 bg-elevated/60 rounded mb-8" />
        <div className="h-20 bg-green-50 dark:bg-green-950/30 rounded-xl mb-8" />
        <div className="grid grid-cols-2 gap-3 mb-10">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-card/60 rounded-xl" />
          ))}
        </div>
        <div className="h-3 w-16 bg-elevated/60 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-12 bg-card/60 rounded-lg" />
          <div className="h-12 bg-card/60 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

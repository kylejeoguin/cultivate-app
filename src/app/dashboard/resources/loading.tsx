export default function ResourcesLoading() {
  return (
    <div className="min-h-screen bg-surface text-content">
      <div className="border-b border-line/60 px-6 py-4 h-14" />
      <div className="max-w-2xl mx-auto px-6 py-8 animate-pulse">
        <div className="h-6 bg-elevated rounded w-32 mb-2" />
        <div className="h-4 bg-elevated/60 rounded w-64 mb-8" />
        <div className="h-12 bg-card/60 border border-line/60 rounded-xl mb-8" />
        <div className="h-4 bg-elevated rounded w-24 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card/60 border border-line rounded-xl p-4 h-36" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4">
        <div className="h-4 w-40 bg-elevated rounded" />
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <div className="h-6 w-48 bg-elevated rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-card rounded-xl" />
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-card rounded-xl" />
        ))}
      </div>
    </div>
  )
}

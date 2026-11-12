export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-20 bg-elevated rounded" />
          <div className="h-4 w-16 bg-elevated rounded" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8">
          <div className="h-8 w-12 bg-elevated rounded-lg" />
          <div className="h-8 w-24 bg-elevated rounded-lg" />
          <div className="h-8 w-24 bg-elevated rounded-lg" />
        </div>
        <div className="h-3 w-12 bg-elevated/60 rounded mb-3" />
        <div className="space-y-3 mb-8">
          <div className="h-24 bg-card/60 rounded-xl" />
          <div className="h-24 bg-card/60 rounded-xl" />
        </div>
        <div className="h-3 w-16 bg-elevated/60 rounded mb-3" />
        <div className="space-y-3">
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export default function HomesteadLoading() {
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
        <div className="h-7 w-36 bg-elevated rounded-lg mb-2" />
        <div className="h-4 w-64 bg-elevated/60 rounded mb-6" />
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="h-36 bg-card/60 rounded-xl" />
          <div className="h-36 bg-card/60 rounded-xl" />
          <div className="h-36 bg-card/60 rounded-xl" />
        </div>
        <div className="h-3 w-28 bg-elevated/60 rounded mb-4" />
        <div className="space-y-2">
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
          <div className="h-16 bg-card/60 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

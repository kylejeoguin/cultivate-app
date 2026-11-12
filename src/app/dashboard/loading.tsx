export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-surface text-content animate-pulse">
      <div className="border-b border-line/60 px-6 py-4 flex items-center justify-between">
        <div className="h-5 w-28 bg-elevated rounded-lg" />
        <div className="h-4 w-36 bg-elevated rounded-lg" />
      </div>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="h-7 w-48 bg-elevated rounded-lg mb-2" />
        <div className="h-4 w-36 bg-elevated/60 rounded mb-10" />
        <div className="grid grid-cols-2 gap-3 mb-10">
          <div className="h-20 bg-card/60 rounded-xl" />
          <div className="h-20 bg-card/60 rounded-xl" />
        </div>
        <div className="h-3 w-16 bg-elevated/60 rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-card/60 rounded-xl" />
          <div className="h-32 bg-card/60 rounded-xl" />
          <div className="h-32 bg-card/60 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

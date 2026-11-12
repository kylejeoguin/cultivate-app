import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-green-700">404</p>
      <h1 className="text-2xl font-semibold text-content">Page not found</h1>
      <p className="max-w-md text-subtle">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600/40"
      >
        Back to home
      </Link>
    </main>
  )
}

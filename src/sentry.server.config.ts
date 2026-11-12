// Sentry — server-side init (Node runtime). Loaded by src/instrumentation.ts.
// No DSN set => Sentry.init becomes a no-op, so this is safe to ship before the
// DSN exists. Add SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) to enable.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Performance tracing: light sample to stay well inside the free tier.
  tracesSampleRate: 0.1,
  // Only chatter to the console in dev.
  debug: false,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

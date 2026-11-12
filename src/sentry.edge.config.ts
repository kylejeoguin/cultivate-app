// Sentry — edge runtime init (middleware, edge routes). Loaded by src/instrumentation.ts.
// No DSN => no-op. See sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

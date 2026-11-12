// Sentry — browser/client init. Runs before the app becomes interactive
// (Next 16 instrumentation-client convention). No DSN => no-op.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session Replay is OFF by default — opt in later if we want it (it has its own quota).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  debug: false,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

// Instruments client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

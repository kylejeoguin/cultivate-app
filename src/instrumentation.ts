// Next.js server instrumentation (runs once per server instance).
// Wires Sentry into the right runtime + forwards server/RSC errors to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, etc.
export const onRequestError = Sentry.captureRequestError;

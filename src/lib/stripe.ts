import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
      // Resilience: let the SDK transparently retry transient network/5xx failures with
      // backoff, and cap how long a hung connection can block a checkout/portal request.
      maxNetworkRetries: 2,
      timeout: 10000,
    })
  }
  return _stripe
}

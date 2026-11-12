import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', user.id)
    .single()

  if (sub?.status === 'active' || sub?.status === 'trialing') {
    return NextResponse.json({ error: 'already_subscribed' }, { status: 400 })
  }

  let plan: 'monthly' | 'annual' = 'monthly'
  let tier: 'individual' | 'family' = 'individual'

  try {
    const body = await request.json()
    if (body?.plan === 'annual') plan = 'annual'
    if (body?.tier === 'family') tier = 'family'
  } catch { /* defaults */ }

  // Select the correct price ID based on tier + billing cadence
  let priceId: string
  if (tier === 'family') {
    priceId = plan === 'annual'
      ? process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID!
      : process.env.STRIPE_FAMILY_PRICE_ID!
  } else {
    priceId = plan === 'annual'
      ? process.env.STRIPE_ANNUAL_PRICE_ID!
      : process.env.STRIPE_PRICE_ID!
  }

  const stripe = getStripe()
  let customerId = sub?.stripe_customer_id

  // Resolve the Stripe customer. Prefer the app-row id; otherwise look one up by email
  // (real-time — unlike the eventually-consistent customer search index) so a fast
  // double-submit during the async webhook-write lag REUSES the same customer instead of
  // spawning a duplicate (the fingerprint behind cult1's two customers). Only create when
  // truly none exists.
  if (!customerId) {
    const existing = await stripe.customers.list({ email: user.email!, limit: 100 })
    const match = existing.data.find(c => c.metadata?.supabase_user_id === user.id) ?? existing.data[0]
    customerId = match?.id
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { supabase_user_id: user.id },
    }, {
      // One customer per user even if this request is retried after a dropped connection
      // (Stripe replays the first response for 24h) — hardens the duplicate-customer hole.
      idempotencyKey: `cust-create-${user.id}`,
    })
    customerId = customer.id
  }

  // Inspect this customer's full Stripe subscription history. Two distinct guards:
  //  1. A currently-live sub (trialing/active) → block: they're already subscribed. This also
  //     covers the double-trial WINDOW (the app `subscriptions` row is written by the webhook
  //     AFTER checkout completes, so a double-click / back-button retry can pass the app-row
  //     check at the top of this handler before that row exists — Stripe is the authoritative
  //     real-time source the async app row can't provide).
  //  2. ANY prior sub (e.g. a lapsed/canceled trial) → this customer has already used their one
  //     free trial. Don't grant a second one — route them to a trial-less PAID checkout
  //     ("subscribe to continue"). We knowingly accept that a brand-new email gets a fresh trial;
  //     we only close the SAME-customer repeat-trial hole. A card IS required on every checkout,
  //     first-time trial included — see payment_method_collection below (changed 2026-08-26).
  const history = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
  if (history.data.some(s => s.status === 'trialing' || s.status === 'active')) {
    return NextResponse.json({ error: 'already_subscribed' }, { status: 400 })
  }
  const trialAlreadyUsed = history.data.length > 0

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    // Card is ALWAYS collected, trial or not (changed 2026-08-26). The no-card trial optimised for
    // signup VOLUME, and volume was never the constraint — 12 signups produced 0 returning users.
    // Collecting up front buys INTENT and lets the 7-day trial roll straight into the paid plan.
    payment_method_collection: 'always',
    subscription_data: {
      metadata: { supabase_user_id: user.id, tier },
      ...(trialAlreadyUsed
        ? {}
        : {
            trial_period_days: 7,
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          }),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    allow_promotion_codes: true,
    customer_update: { address: 'auto' },
  }, {
    // Dedupe a fast double-submit of the SAME selection into one session (Stripe replays for
    // 24h). A different tier/plan/trial state produces a different key → a fresh session.
    idempotencyKey: `checkout-${user.id}-${tier}-${plan}-${trialAlreadyUsed ? 'paid' : 'trial'}`,
  })

  // trialGranted lets the pricing button explain a trial-less (returning-customer) checkout
  // instead of springing a surprise charge on a "Start Free Trial" click.
  return NextResponse.json({ url: session.url, trialGranted: !trialAlreadyUsed })
}

import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendAlert } from '@/lib/alert'
import { enrollTrialUser } from '@/lib/mailerlite'

const FAMILY_PRICE_IDS = new Set([
  process.env.STRIPE_FAMILY_PRICE_ID,
  process.env.STRIPE_FAMILY_ANNUAL_PRICE_ID,
])

function getTierFromPriceId(priceId: string | null | undefined): 'individual' | 'family' {
  return priceId && FAMILY_PRICE_IDS.has(priceId) ? 'family' : 'individual'
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        // Under Stripe "flexible" billing mode, checkout.session.completed can arrive with
        // session.subscription === null. The reliable write path is customer.subscription.created
        // (enabled on the webhook), so defer to it rather than writing a half record here.
        if (!session.subscription) {
          console.warn(
            `[stripe-webhook] checkout.session.completed ${session.id} had no subscription; ` +
              `deferring to customer.subscription.created`
          )
          break
        }

        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
        const userId = stripeSub.metadata.supabase_user_id
        if (!userId) {
          console.error(
            `[stripe-webhook] checkout.session.completed: subscription ${stripeSub.id} ` +
              `missing supabase_user_id metadata`
          )
          break
        }

        const priceId = stripeSub.items.data[0]?.price.id ?? null
        const tier = getTierFromPriceId(priceId)

        const { error } = await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            stripe_price_id: priceId,
            tier,
            status: 'trialing',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        if (error) {
          if (error.code === '23503') {
            // FK violation: user_id no longer exists in auth.users — the account
            // was deleted. Stripe still emits events for the orphaned subscription;
            // ack with 200 so Stripe stops retrying and we stop alert-spamming.
            console.warn(
              `[stripe-webhook] checkout.session.completed: user ${userId} no longer exists (deleted account); skipping upsert`
            )
            break
          }
          console.error(
            `[stripe-webhook] subscriptions upsert failed (checkout.session.completed, user ${userId}):`,
            error
          )
          void sendAlert('Stripe webhook DB write failed', `checkout.session.completed · user ${userId} · ${error.message}`)
          return NextResponse.json({ error: 'db_write_failed' }, { status: 500 })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata.supabase_user_id
        if (!userId) {
          console.error(
            `[stripe-webhook] ${event.type}: subscription ${sub.id} missing supabase_user_id metadata`
          )
          break
        }

        const priceId = sub.items.data[0]?.price.id ?? null
        const tier = getTierFromPriceId(priceId)

        const { error } = await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: sub.customer as string,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            tier,
            status: sub.status,
            trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        if (error) {
          if (error.code === '23503') {
            // FK violation: user_id no longer exists in auth.users — the account
            // was deleted. Stripe still emits events for the orphaned subscription
            // (trial ticks, final "ended" update); ack with 200 so Stripe stops
            // retrying and we stop alert-spamming over a customer who already left.
            console.warn(
              `[stripe-webhook] ${event.type}: user ${userId} no longer exists (deleted account); skipping upsert`
            )
            break
          }
          console.error(
            `[stripe-webhook] subscriptions upsert failed (${event.type}, user ${userId}):`,
            error
          )
          void sendAlert('Stripe webhook DB write failed', `${event.type} · user ${userId} · ${error.message}`)
          return NextResponse.json({ error: 'db_write_failed' }, { status: 500 })
        }

        // Put the user on the trial email sequence. This is THE enrollment point: it is the
        // first moment a trial actually exists, and Stripe guarantees delivery by retrying.
        // (It used to live in /auth/callback behind a PKCE exchange that silently failed for
        // every user who opened the confirmation email in a mail app — see lib/mailerlite.ts.)
        //
        // `.created` only: `.updated` fires repeatedly over a subscription's life (trial ticks,
        // plan changes, cancellation) and would re-POST on every one.
        //
        // Deliberately NOT awaited into the response contract: a MailerLite failure must not
        // 500 this webhook, or an outage at their end would stall subscription writes and
        // trigger endless Stripe retries. enrollTrialUser never throws and alerts on failure.
        //
        // Own try/catch on purpose: this block must NEVER reach the outer catch. If it did, an
        // email-side failure would 500 the webhook → Stripe retries → it throws again → a retry
        // loop and alert spam, all over a newsletter. The subscription row is already committed
        // above by this point, which is the part that actually must not be lost.
        if (event.type === 'customer.subscription.created') {
          try {
            const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId)
            if (authErr || !authUser?.user?.email) {
              console.error(
                `[stripe-webhook] could not resolve email for user ${userId}; trial enrollment skipped`,
                authErr
              )
              void sendAlert(
                'MailerLite trial enrollment skipped',
                `Could not resolve an email for user ${userId} — they are trialing but not on the sequence.`
              )
            } else {
              // ★ NEW SIGNUP NOTICE. This lives here, not in the auth callback, for exactly
              // the reason recorded in src/app/auth/callback/route.ts: that callback cannot
              // resolve a user when the confirmation link is opened in a mail app, so anything
              // hung off it fails silently. customer.subscription.created is guaranteed to run.
              //
              // Why it earns an interruption at all: Cultivate is in maintenance mode and
              // nobody watches the dashboard daily. The last organic signup went unnoticed for
              // days. A signup is now the ONLY event worth a push.
              void sendAlert(
                'New signup',
                `${authUser.user.email}\nuser ${userId}\n${new Date().toISOString()}`,
                'notice',
              )
              await enrollTrialUser(
                authUser.user.email,
                (authUser.user.user_metadata?.full_name as string | undefined) ?? null
              )
            }
          } catch (e) {
            console.error(`[stripe-webhook] trial enrollment threw for user ${userId}:`, e)
            void sendAlert(
              'MailerLite trial enrollment FAILED',
              `user ${userId} is trialing but not on the sequence · ${e instanceof Error ? e.message : String(e)}`
            )
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id)
        if (error) {
          console.error(
            `[stripe-webhook] subscriptions cancel update failed (sub ${sub.id}):`,
            error
          )
          void sendAlert('Stripe webhook DB write failed', `customer.subscription.deleted · sub ${sub.id} · ${error.message}`)
          return NextResponse.json({ error: 'db_write_failed' }, { status: 500 })
        }
        break
      }
    }
  } catch (err) {
    // Returning 500 makes Stripe retry the event (with backoff) instead of dropping it.
    // All writes above are idempotent (upsert on user_id / update by subscription id), so retries are safe.
    console.error(`[stripe-webhook] unhandled error processing ${event.type} (${event.id}):`, err)
    void sendAlert('Stripe webhook handler error', `${event.type} (${event.id}) · ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({ error: 'handler_error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

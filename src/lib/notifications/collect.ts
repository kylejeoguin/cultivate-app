import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReminderPrefs, ReminderSnapshot, Weekday } from './decide'

/**
 * Gathers everything decide.ts needs for one recipient. All I/O lives here so the
 * judgement in decide.ts stays pure and inspectable.
 *
 * ⚠️ Runs with the SERVICE-ROLE client, because a cron has no session and therefore
 * no auth.uid() for RLS to resolve. That means RLS is bypassed and every query below
 * must scope by household EXPLICITLY. Get that wrong and one family's chores land in
 * another family's inbox — which is the same class of cross-tenant bug the 08-05
 * audit found, just delivered by email instead of PostgREST.
 */

/**
 * A person's household id. Mirrors the DB's household_owner_of(): an accepted family
 * member belongs to the inviter's household; everyone else is their own household.
 * Queried directly rather than via RPC so the scoping is visible at the call site.
 */
export async function householdOwnerOf(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from('family_members')
    .select('owner_id, accepted_at')
    .eq('member_id', userId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: true, nullsFirst: false })
    .limit(1)
  return data?.[0]?.owner_id ?? userId
}

type ServiceRow = {
  id: string
  name: string
  next_due_date: string
  equipment_maintenance: { equipment_name: string } | { equipment_name: string }[] | null
}

/** PostgREST returns an embedded to-one as an object or a single-element array depending on inference. */
function equipmentNameOf(row: ServiceRow): string {
  const e = row.equipment_maintenance
  if (!e) return 'Equipment'
  return (Array.isArray(e) ? e[0]?.equipment_name : e.equipment_name) ?? 'Equipment'
}

export async function collectSnapshot(
  admin: SupabaseClient,
  userId: string,
  todayISO: string,
  weekday: Weekday,
  prefs: ReminderPrefs,
): Promise<ReminderSnapshot> {
  const household = await householdOwnerOf(admin, userId)

  const [lastLogRes, childRes, choreRes, serviceRes, sentRes] = await Promise.all([
    admin
      .from('daily_log')
      .select('log_date')
      .eq('user_id', household)
      .order('log_date', { ascending: false })
      .limit(1),
    admin.from('children').select('id').eq('user_id', household).limit(1),
    admin
      .from('homestead_chores')
      .select('id, name, next_due_date')
      .eq('user_id', household)
      .eq('is_active', true)
      .lte('next_due_date', todayISO)
      .order('next_due_date'),
    admin
      .from('equipment_services')
      .select('id, name, next_due_date, equipment_maintenance(equipment_name)')
      .eq('user_id', household)
      .eq('is_active', true)
      .not('next_due_date', 'is', null)
      .lte('next_due_date', todayISO)
      .order('next_due_date'),
    // Re-nag is measured PER RECIPIENT, not per household: if two parents both opted
    // in, each has their own cadence and neither suppresses the other's reminder.
    admin
      .from('notification_sends')
      .select('item_type, item_key, sent_on')
      .eq('user_id', userId)
      .order('sent_on', { ascending: false }),
  ])

  const lastSent: Record<string, string> = {}
  for (const row of sentRes.data ?? []) {
    const k = `${row.item_type}:${row.item_key}`
    // Rows arrive newest-first, so the first occurrence of a key is the most recent.
    if (!(k in lastSent)) lastSent[k] = row.sent_on
  }

  return {
    todayISO,
    weekday,
    lastSchoolLogDate: lastLogRes.data?.[0]?.log_date ?? null,
    hasChildren: (childRes.data?.length ?? 0) > 0,
    chores: (choreRes.data ?? []).map(c => ({
      id: c.id,
      name: c.name,
      nextDueDate: c.next_due_date,
    })),
    services: ((serviceRes.data ?? []) as unknown as ServiceRow[]).map(s => ({
      id: s.id,
      name: s.name,
      equipmentName: equipmentNameOf(s),
      nextDueDate: s.next_due_date,
    })),
    lastSent,
    prefs,
  }
}

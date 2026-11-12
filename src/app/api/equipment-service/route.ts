import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EquipmentService } from '@/lib/types'

// Mutations for equipment service-types + the performed-service history log.
// All writes are RLS-scoped (user owns their rows). After any change we recompute the parent
// equipment_maintenance rollup (earliest upcoming due-date + most-recent service date) so the
// dashboard/homestead/home-diy surfaces that read those columns stay correct.

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function recomputeRollup(
  supabase: Awaited<ReturnType<typeof createClient>>, equipmentId: string,
) {
  const { data } = await supabase
    .from('equipment_services')
    .select('next_due_date, last_service_date')
    .eq('equipment_id', equipmentId)
    .eq('is_active', true)
  const rows = (data ?? []) as { next_due_date: string | null; last_service_date: string | null }[]
  const dueDates = rows.map(r => r.next_due_date).filter((d): d is string => !!d).sort()
  const lastDates = rows.map(r => r.last_service_date).filter((d): d is string => !!d).sort()
  await supabase
    .from('equipment_maintenance')
    .update({
      next_service_date: dueDates[0] ?? null,          // earliest upcoming due across services
      last_service_date: lastDates[lastDates.length - 1] ?? null,  // most recent service
    })
    .eq('id', equipmentId)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const action = body?.action

    // ── Create / update a service definition ──────────────────────────────
    if (action === 'save_service') {
      const equipmentId: string = body.equipmentId
      const serviceId: string | undefined = body.serviceId
      const name = (body.name ?? '').toString().trim().slice(0, 120)
      const intervalUnit: 'days' | 'hours' = body.intervalUnit === 'hours' ? 'hours' : 'days'
      const intervalValue = Number.isFinite(body.intervalValue) && body.intervalValue > 0 ? Math.round(body.intervalValue) : null
      const notes = body.notes ? body.notes.toString().trim().slice(0, 500) : null
      if (!equipmentId || !name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

      // The user-set "due at" placeholder (either a date or an hours reading).
      const nextDueDate = intervalUnit === 'days' && body.nextDueDate ? String(body.nextDueDate) : null
      const nextDueHours = intervalUnit === 'hours' && Number.isFinite(body.nextDueHours) && body.nextDueHours >= 0 ? Number(body.nextDueHours) : null

      const fields = {
        name,
        interval_unit: intervalUnit,
        interval_value: intervalValue,
        next_due_date: nextDueDate,
        next_due_hours: nextDueHours,
        notes,
        updated_at: new Date().toISOString(),
      }

      if (serviceId) {
        const { error } = await supabase.from('equipment_services').update(fields).eq('id', serviceId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      } else {
        const { error } = await supabase.from('equipment_services').insert({ user_id: user.id, equipment_id: equipmentId, ...fields })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
      await recomputeRollup(supabase, equipmentId)
      return NextResponse.json({ ok: true })
    }

    // ── Delete a service definition (history log is preserved: FK set null) ─
    if (action === 'delete_service') {
      const serviceId: string = body.serviceId
      const equipmentId: string = body.equipmentId
      if (!serviceId) return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 })
      const { error } = await supabase.from('equipment_services').delete().eq('id', serviceId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (equipmentId) await recomputeRollup(supabase, equipmentId)
      return NextResponse.json({ ok: true })
    }

    // ── Log a performed service ────────────────────────────────────────────
    if (action === 'log_service') {
      const equipmentId: string = body.equipmentId
      const serviceId: string | null = body.serviceId || null
      const serviceDate: string = body.serviceDate
      const hoursAtService = Number.isFinite(body.hoursAtService) && body.hoursAtService >= 0 ? Number(body.hoursAtService) : null
      const notes = body.notes ? body.notes.toString().trim().slice(0, 500) : null
      if (!equipmentId || !serviceDate) return NextResponse.json({ error: 'Missing date' }, { status: 400 })

      // Resolve the service name (for the denormalized history record).
      let serviceName = 'General service'
      let service: EquipmentService | null = null
      if (serviceId) {
        const { data } = await supabase.from('equipment_services').select('*').eq('id', serviceId).maybeSingle()
        service = (data as EquipmentService | null)
        if (service) serviceName = service.name
      }

      const { error: logErr } = await supabase.from('equipment_service_log').insert({
        user_id: user.id, equipment_id: equipmentId, service_id: serviceId,
        service_name: serviceName, service_date: serviceDate, hours_at_service: hoursAtService, notes,
      })
      if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 })

      // Advance the service's schedule from this service event.
      if (service) {
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (service.interval_unit === 'days') {
          upd.last_service_date = serviceDate
          upd.next_due_date = service.interval_value ? addDays(serviceDate, service.interval_value) : service.next_due_date
        } else {
          upd.last_service_date = serviceDate
          if (hoursAtService !== null) {
            upd.last_service_hours = hoursAtService
            upd.next_due_hours = service.interval_value ? hoursAtService + service.interval_value : service.next_due_hours
          }
        }
        await supabase.from('equipment_services').update(upd).eq('id', service.id)
      }
      await recomputeRollup(supabase, equipmentId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[equipment-service] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

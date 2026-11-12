'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function addHomesteadInput(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const section = formData.get('section') as string
  const category = formData.get('category') as string
  const input_date = formData.get('input_date') as string
  const item = formData.get('item') as string
  const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : null
  const unit = formData.get('unit') as string || null
  const cost = Number(formData.get('cost'))
  const notes = formData.get('notes') as string || null
  // Only livestock costs carry an animal attribution; the picker isn't rendered elsewhere.
  const animal_type = section === 'livestock'
    ? (formData.get('animal_type') as string || null)
    : null
  // Optional project attribution — the cost rolls into that project's spend. Blank = unattributed.
  const project_id = (formData.get('project_id') as string) || null

  await supabase.from('homestead_inputs').insert({
    user_id: user.id,
    section,
    category,
    input_date,
    item,
    quantity,
    unit,
    cost,
    notes,
    animal_type,
    project_id,
  })

  revalidatePath('/dashboard/homestead/livestock')
  revalidatePath('/dashboard/homestead/garden')
  revalidatePath('/dashboard/homestead/preservation')
}

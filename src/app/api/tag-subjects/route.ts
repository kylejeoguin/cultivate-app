import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    // Auth guard: this endpoint proxies a paid LLM — require a signed-in user (denial-of-wallet protection).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ subjects: [], error: 'Unauthorized' }, { status: 401 })
    }

    const { description, subjects } = await req.json()

    if (!description?.trim() || !subjects?.length) {
      return NextResponse.json({ subjects: [] })
    }

    const subjectList = subjects.map((s: { name: string }) => s.name).join(', ')

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are helping a homeschool family log their school day. A typical day covers multiple subjects — scan the entire description carefully and tag every subject that applies, even if it's mentioned briefly.

The family's required subjects are: ${subjectList}

Rules:
- A single description often covers 3-5 subjects. Be thorough.
- Tag a subject if it's clearly present, even as a small part of the day.
- Coloring/drawing/crafts = Fine Arts. Writing letters/words = Language Arts. Reading books = Reading. Movement/sports/gymnastics = Health & PE. Nature/animals/plants/science experiments = Science. Math facts/counting/measuring = Mathematics.
- When in doubt, include it — the family can deselect anything that doesn't fit.
- Return ONLY a JSON array of subject names from the list above. No explanation.

Description: "${description.trim()}"

Example output for "We read two chapters, practiced multiplication, and did a nature walk where we identified birds": ["Reading", "Mathematics", "Science"]`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'

    // Parse the returned JSON array safely
    const matched: string[] = JSON.parse(text)
    const validSubjectNames = new Set(subjects.map((s: { name: string }) => s.name))
    const filtered = matched.filter((name: string) => validSubjectNames.has(name))

    return NextResponse.json({ subjects: filtered })
  } catch (err) {
    console.error('[tag-subjects] error:', err)
    return NextResponse.json({ subjects: [], error: err instanceof Error ? err.message : 'unknown' })
  }
}

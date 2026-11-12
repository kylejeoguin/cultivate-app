'use client'

import type { Child, Subject } from '@/lib/types'
import { formatDateWeekday } from '@/lib/dates'
import { photoSrc } from '@/lib/photoUrls'

interface DailyLog {
  id: string
  child_id: string
  log_date: string
  notes: string | null
  hours: number | null
  subject_ids: string[]
  is_homestead_day: boolean
  created_at: string
  photo_urls?: string[] | null
}


export function LogCard({
  log,
  childMap,
  subjectMap,
  multiChild,
  onEdit,
}: {
  log: DailyLog
  childMap: Record<string, string>
  subjectMap: Record<string, string>
  multiChild: boolean
  onEdit: () => void
}) {
  return (
    <div className="bg-card/60 border border-line rounded-xl p-4" style={{ borderLeftColor: 'rgb(21 128 61 / 0.5)', borderLeftWidth: '2px' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{formatDateWeekday(log.log_date)}</span>
          {multiChild && (
            <span className="text-xs text-subtle">{childMap[log.child_id]}</span>
          )}
          {log.is_homestead_day && (
            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400 px-2 py-0.5 rounded-full">Hands-on day</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {log.hours ? (
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">{log.hours}h</span>
          ) : null}
          <button
            onClick={onEdit}
            className="text-xs text-subtle hover:text-content transition-colors px-2 py-0.5 rounded border border-line-strong hover:border-stone-500"
          >
            Edit
          </button>
        </div>
      </div>

      {log.notes && (
        <p className="text-sm text-content leading-relaxed mb-2">{log.notes}</p>
      )}

      {log.subject_ids?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {log.subject_ids.map(id => (
            <span key={id} className="text-xs bg-elevated text-muted px-2 py-0.5 rounded-full">
              {subjectMap[id] ?? id}
            </span>
          ))}
        </div>
      )}

      {log.photo_urls && log.photo_urls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {log.photo_urls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            // Both the thumbnail and the open-in-new-tab link go through photoSrc: the bucket is
            // private, so the stored URL is an identifier now, not something a browser can fetch.
            <a key={i} href={photoSrc(url)} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={photoSrc(url, 320)}
                alt={`Photo ${i + 1} from ${formatDateWeekday(log.log_date)}`}
                className="w-16 h-16 object-cover rounded-lg border border-line-strong hover:border-stone-500 transition-colors"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

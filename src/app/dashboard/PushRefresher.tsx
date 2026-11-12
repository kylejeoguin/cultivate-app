'use client'

import { useEffect } from 'react'
import { refreshPush } from '@/lib/push/client'

/**
 * Keeps this device's push subscription row current on every dashboard load.
 * Browsers rotate subscriptions; without a refresh the stored endpoint goes stale and
 * reminders silently stop. Never prompts for permission (only the button does) and
 * renders nothing.
 */
export default function PushRefresher() {
  useEffect(() => { void refreshPush() }, [])
  return null
}

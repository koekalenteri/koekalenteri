import { useEffect } from 'react'
import { useSetRecoilState } from 'recoil'

import { stackName } from '../lib/env'
import { patchMerge } from '../lib/utils'
import { eventsAtom } from '../pages/recoil'

export const useEventSource = () => {
  const setEvents = useSetRecoilState(eventsAtom)

  useEffect(() => {
    const eventSource = new EventSource(`https://sse-worker.koekalenteri.workers.dev?channel=${stackName()}`)

    eventSource.onopen = () => {
      console.log('SSE: connected')
    }

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      console.debug('SSE', payload)

      if (!payload?.eventId) return

      const { eventId, ...patch } = payload

      setEvents((current) => {
        let changed = false
        const next = current.map((e) => {
          if (e.id !== eventId) return e
          const merged = patchMerge(e, patch)
          if (merged !== e) changed = true
          return merged
        })

        return changed ? next : current
      })
    }

    eventSource.onerror = (err) => {
      console.error('SSE error:', err)
    }

    return () => {
      eventSource.close()
    }
  }, [])
}

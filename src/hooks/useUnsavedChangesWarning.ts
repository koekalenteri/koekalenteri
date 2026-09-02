import { useConfirm } from 'material-ui-confirm'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker } from 'react-router'

/**
 * Asks before leaving a page with unsaved edits (KOE-1283): in-app navigation is intercepted with a
 * confirm dialog, and closing or reloading the tab gets the browser's own prompt.
 */
export const useUnsavedChangesWarning = (when: boolean) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname
  )
  // The blocker's identity is not stable across renders while it stays blocked; without this guard
  // the effect would open a new confirm dialog on every render.
  const prompting = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || prompting.current) return
    prompting.current = true
    confirm({
      cancellationText: t('unsavedChanges.stay'),
      confirmationText: t('unsavedChanges.leave'),
      description: t('unsavedChanges.description'),
      title: t('unsavedChanges.title'),
    }).then(({ confirmed }) => {
      prompting.current = false
      if (confirmed) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker, confirm, t])

  useEffect(() => {
    if (!when) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}

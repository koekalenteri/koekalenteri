import { getStorageKeysStartingWith } from '../../../lib/client/storage'
import { isTestEnv } from '../../../lib/env'
import { appVersion, isEarlierVersionThan } from '../../../lib/version'

export const cleanPre112 = () => {
  const remove: string[] = getStorageKeysStartingWith([
    'adminEvents',
    'adminOrganizers',
    'adminUsers',
    'editableAdminEventRegistration/eventId+Id__',
    'editableEmailTemplate/Id',
    'editableEvent/Id__',
    'editableRegistration/ids__',
    'emailTemplates',
    'emailTemplates',
    'eventTypes',
    'judges',
    'newRegistration',
    'officials',
    'open/eventId__',
    'registration/ids__',
  ])
  for (const key of remove) {
    localStorage.removeItem(key)
  }
  console.log(`Cleaned up ${remove.length} storage keys deprecated in version 1.1.2`)
}

export const runCleaners = () => {
  if (isTestEnv()) return

  const currentVersion = localStorage.getItem('version') ?? ''

  if (currentVersion === appVersion) return

  if (isEarlierVersionThan('1.1.3')) cleanPre112()

  localStorage.setItem('version', appVersion)
}

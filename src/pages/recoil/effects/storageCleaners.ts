import { clearEncryptedStore } from '../../../lib/client/encryptedStore'
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

  if (isEarlierVersionThan('1.1.3', currentVersion)) cleanPre112()

  // Encrypted cache schema was introduced in 1.9.0. Only wipe it when upgrading from
  // an earlier version that may have stored an incompatible payload format.
  // Cleanup runs in parallel with atom effects; cache read failures are ignored
  // and stale blobs are overwritten after refetch.
  if (isEarlierVersionThan('1.9.0', currentVersion)) {
    clearEncryptedStore().catch((e) => console.warn('Failed to clean encrypted store', e))
  }

  localStorage.setItem('version', appVersion)
}

import { clearEncryptedStore } from '../../../lib/client/encryptedStore'
import { getStorageKeysStartingWith } from '../../../lib/client/storage'
import { isTestEnv } from '../../../lib/env'
import { DEFAULT_OWNER_KEY } from '../../../lib/registration'
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

// 1.10.7 changed the cached dog owner from a single person to a list of owners.
export const migrateDogCacheOwners = () => {
  const raw = localStorage.getItem('dog-cache')
  if (!raw) return
  try {
    const cache: unknown = JSON.parse(raw)
    if (!cache || typeof cache !== 'object') return
    let migrated = false
    for (const entry of Object.values(cache)) {
      const owner: unknown = entry?.owner
      if (!owner || typeof owner !== 'object' || 'owners' in owner) continue
      const { ownerHandles, ownerPays, membership, ...person } = owner as Record<string, unknown>
      entry.owner = {
        ownerHandles,
        ownerPays,
        owners: [{ ...person, key: DEFAULT_OWNER_KEY, membership: membership ?? {} }],
      }
      migrated = true
    }
    if (migrated) {
      localStorage.setItem('dog-cache', JSON.stringify(cache))
      console.log('Migrated dog-cache owners to list format')
    }
  } catch (e) {
    console.warn('Failed to migrate dog-cache, removing it', e)
    localStorage.removeItem('dog-cache')
  }
}

export const runCleaners = () => {
  if (isTestEnv()) return

  const currentVersion = localStorage.getItem('version') ?? ''

  if (currentVersion === appVersion) return

  if (isEarlierVersionThan('1.1.3', currentVersion)) cleanPre112()

  // Encrypted cache schema was introduced in 1.9.0. Only wipe it when upgrading from
  // an earlier version that may have stored an incompatible payload format.
  // Cleanup runs in parallel with atom initialization; cache read failures are ignored
  // and stale blobs are overwritten after refetch.
  if (isEarlierVersionThan('1.9.0', currentVersion)) {
    clearEncryptedStore().catch((e) => console.warn('Failed to clean encrypted store', e))
  }

  if (isEarlierVersionThan('1.10.7', currentVersion)) migrateDogCacheOwners()

  localStorage.setItem('version', appVersion)
}

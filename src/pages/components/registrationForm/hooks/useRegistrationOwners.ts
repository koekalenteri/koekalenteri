import type { DeepPartial, Registration, RegistrationOwner } from '../../../../types'
import { useCallback, useMemo } from 'react'
import { emptyPerson } from '../../../../lib/data'
import { DEFAULT_OWNER_KEY, getRegistrationOwners, ownerKeyAt, stripOwnerKey } from '../../../../lib/registration'
import { useDogCacheKey } from './useDogCacheKey'

/**
 * The registration's owner list and the one writer for changes to it, shared by every section that
 * edits owners (OwnerInfo edits the people, MembershipInfo their memberships). Both must go through
 * the same cache bookkeeping, or one section's edit would clobber what the other learned.
 */
export function useRegistrationOwners(
  reg: DeepPartial<Registration>,
  orgId: string,
  onChange?: (props: DeepPartial<Registration>) => void
) {
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'owner')

  const owners = useMemo<DeepPartial<RegistrationOwner>[]>(() => {
    const list = getRegistrationOwners({ owner: reg.owner, owners: reg.owners })
    if (!list.length) return [{ ...emptyPerson, key: DEFAULT_OWNER_KEY }]
    // Keyless (legacy/API-written) entries get deterministic position-based keys so this render is
    // stable; they must stay distinct or edits would apply to every keyless row at once.
    return list.map((o, index) => ('key' in o && o.key ? o : { ...o, key: ownerKeyAt(o, index) }))
  }, [reg.owners, reg.owner])

  const updateOwners = useCallback(
    (
      newOwners: DeepPartial<RegistrationOwner>[],
      extra?: Partial<Pick<Registration, 'ownerHandles' | 'ownerPays'>>
    ) => {
      const cachedOwners = newOwners.map((o) => {
        const existing = cache?.owners?.find((c) => c.key === o.key)
        const previous = owners.find((p) => p.key === o.key)
        // The form holds membership of the hosting organization; the cache keeps it per organization.
        // Only an actual membership edit may update the cache — an unrelated field edit must not
        // overwrite membership learned in a later registration with this row's older value.
        const membership = { ...existing?.membership }
        if (typeof o.membership === 'boolean' && o.membership !== previous?.membership) {
          membership[orgId] = o.membership
        }
        return { ...existing, ...o, membership }
      })
      setCache({ ...cache, ...extra, owners: cachedOwners })
      // `registration.owner` mirrors the first owner as a plain person; the list `key` is client-only.
      const [first] = newOwners
      onChange?.({ owner: first && stripOwnerKey(first), owners: newOwners, ...extra })
    },
    [cache, onChange, orgId, owners, setCache]
  )

  return { cache, owners, setCache, updateOwners }
}

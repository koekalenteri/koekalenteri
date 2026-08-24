import type { DeepPartial, Registration, RegistrationOwner } from '../../../types'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { emptyPerson } from '../../../lib/data'
import { DEFAULT_OWNER_KEY, getRegistrationOwners, ownerKeyAt, stripOwnerKey } from '../../../lib/registration'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import OwnerRow from './ownerInfo/OwnerRow'
import OwnerSelect, { ownerSelectionValue } from './ownerInfo/OwnerSelect'

interface Props {
  readonly admin?: boolean
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly orgId: string
}

export function OwnerInfo({ admin, reg, disabled, error, helperText, onChange, onOpenChange, open, orgId }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'owner')

  const owners = useMemo<DeepPartial<RegistrationOwner>[]>(() => {
    const list = getRegistrationOwners({ owner: reg.owner, owners: reg.owners })
    if (!list.length) return [{ ...emptyPerson, key: DEFAULT_OWNER_KEY }]
    // Keyless (legacy/API-written) entries get deterministic position-based keys so this render is
    // stable; they must stay distinct or edits would apply to every keyless row at once.
    return list.map((o, index) => ('key' in o && o.key ? o : { ...o, key: ownerKeyAt(o, index) }))
  }, [reg.owners, reg.owner])

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them
    if (admin) return

    let changed = false
    const nextOwners = owners.map((owner) => {
      const cachedMembership = cache?.owners?.find((c) => c.key === owner.key)?.membership?.[orgId]
      if (cachedMembership === undefined || owner.membership === cachedMembership) return owner
      changed = true
      return { ...owner, membership: cachedMembership }
    })
    if (changed) {
      const [first] = nextOwners
      onChange?.({ owner: first && stripOwnerKey(first), owners: nextOwners })
    }
  }, [admin, cache, onChange, orgId, owners])

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

  const handleOwnerChange = useCallback(
    (ownerKey: string | undefined, props: DeepPartial<Omit<RegistrationOwner, 'key'>>) => {
      updateOwners(owners.map((o) => (o.key === ownerKey ? { ...o, ...props } : o)))
    },
    [owners, updateOwners]
  )

  const handleAddOwner = useCallback(() => {
    updateOwners([...owners, { ...emptyPerson, key: nanoid(10) }])
  }, [owners, updateOwners])

  const handleRemoveOwner = useCallback(
    (ownerKey: string | undefined) => {
      const newOwners = owners.filter((o) => o.key !== ownerKey)
      const extra: Partial<Pick<Registration, 'ownerHandles' | 'ownerPays'>> = {}
      if (reg.ownerHandles === ownerKey) extra.ownerHandles = newOwners[0]?.key
      if (reg.ownerPays === ownerKey) extra.ownerPays = newOwners[0]?.key
      updateOwners(newOwners, extra)
    },
    [owners, reg.ownerHandles, reg.ownerPays, updateOwners]
  )

  const handleSelectionChange = useCallback(
    (field: 'ownerHandles' | 'ownerPays') => (value: string | false) => {
      setCache({ ...cache, [field]: value })
      onChange?.({ [field]: value })
    },
    [cache, onChange, setCache]
  )

  return (
    <CollapsibleSection
      title={t('registration.owners')}
      error={error}
      helperText={helperText}
      open={open && !!reg.dog?.regNo}
      onOpenChange={onOpenChange}
    >
      <Stack spacing={2}>
        {owners.map((owner, index) => (
          <OwnerRow
            key={owner.key ?? index}
            disabled={disabled}
            idPrefix={`owner_${index}`}
            owner={owner}
            removable={owners.length > 1}
            onChange={(props) => handleOwnerChange(owner.key, props)}
            onRemove={() => handleRemoveOwner(owner.key)}
          />
        ))}
        <Button
          disabled={disabled}
          startIcon={<AddOutlined />}
          onClick={handleAddOwner}
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('registration.cta.addOwner')}
        </Button>
        <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}>
          <OwnerSelect
            disabled={disabled}
            label={t('registration.whoHandles')}
            labelId="owner-handles-label"
            owners={owners}
            value={ownerSelectionValue(reg.ownerHandles, owners)}
            onChange={handleSelectionChange('ownerHandles')}
          />
          <OwnerSelect
            disabled={disabled}
            label={t('registration.whoPays')}
            labelId="owner-pays-label"
            owners={owners}
            value={ownerSelectionValue(reg.ownerPays, owners)}
            onChange={handleSelectionChange('ownerPays')}
          />
        </Stack>
      </Stack>
    </CollapsibleSection>
  )
}

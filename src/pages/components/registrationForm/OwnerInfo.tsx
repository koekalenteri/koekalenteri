import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Switch from '@mui/material/Switch'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import { useLocalStateGroup } from './hooks/useLocalStateGroup'
import { PersonFields } from './PersonFields'

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

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson & { ownerHandles: boolean; ownerPays: boolean }>) => {
      const membership =
        props.membership === undefined ? cache?.membership : { ...cache?.membership, [orgId]: props.membership }
      const cached = setCache({ ...cache, ...props, membership })

      if (cached) {
        const { ownerHandles, ownerPays, ...owner } = cached
        onChange?.({
          owner: { ...owner, membership: owner.membership?.[orgId] ?? false },
          ownerHandles: ownerHandles ?? props.ownerHandles ?? true,
          ownerPays: ownerPays ?? props.ownerPays ?? true,
        })
      }
    },
    [cache, onChange, orgId, setCache]
  )

  const [roleValues, updateRole] = useLocalStateGroup(
    {
      ownerHandles: reg.ownerHandles ?? true,
      ownerPays: reg.ownerPays ?? true,
    },
    handleChange
  )

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them
    if (admin) return

    const cachedMembership = cache?.membership?.[orgId]
    if (cachedMembership !== undefined && reg.owner?.membership !== cachedMembership) {
      onChange?.({ owner: { ...reg.owner, membership: cachedMembership } })
    }
  }, [admin, cache, onChange, orgId, reg.owner])

  return (
    <CollapsibleSection
      title={t('registration.owner')}
      error={error}
      helperText={helperText}
      open={open && !!reg.dog?.regNo}
      onOpenChange={onOpenChange}
    >
      <form>
        <PersonFields disabled={disabled} idPrefix="owner" onChange={handleChange} person={reg.owner} />
      </form>
      <FormGroup>
        <FormControlLabel
          disabled={disabled}
          control={
            <Switch
              role="switch"
              checked={roleValues.ownerHandles}
              onChange={(e) => updateRole('ownerHandles', e.target.checked)}
            />
          }
          label={t('registration.ownerHandles')}
          name="ownerHandles"
        />
        <FormControlLabel
          disabled={disabled}
          control={
            <Switch
              role="switch"
              checked={roleValues.ownerPays}
              onChange={(e) => updateRole('ownerPays', e.target.checked)}
            />
          }
          label={t('registration.ownerPays')}
          name="ownerPays"
        />
      </FormGroup>
    </CollapsibleSection>
  )
}

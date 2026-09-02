import type { DeepPartial, Registration } from '../../../types'
import type { DogCachedInfo } from '../../state/dog'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import { useRegistrationOwners } from './hooks/useRegistrationOwners'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly orgId: string
}

/**
 * Everyone's membership in one place (KOE-1276): a checkbox per owner, plus one for a separate
 * handler. When an owner handles, that owner's checkbox already covers the handling person, so no
 * mirroring (and no disabled mirror checkbox) is needed.
 */
const MembershipInfo = ({ reg, disabled, onChange, orgId }: Props) => {
  const { t } = useTranslation()
  const [handlerCache, setHandlerCache] = useDogCacheKey(reg.dog?.regNo, 'handler')
  const { owners, updateOwners } = useRegistrationOwners(reg, orgId, onChange)

  const handleOwnerMembershipChange = useCallback(
    (ownerKey: string | undefined, membership: boolean) => {
      updateOwners(owners.map((o) => (o.key === ownerKey ? { ...o, membership } : o)))
    },
    [owners, updateOwners]
  )

  const handleHandlerMembershipChange = useCallback(
    (membership: boolean) => {
      // The registration's current handler wins over the cached person; only membership is learned here.
      const cachedHandler: DeepPartial<DogCachedInfo['handler']> | undefined = setHandlerCache({
        ...handlerCache,
        ...reg.handler,
        membership: { ...handlerCache?.membership, [orgId]: membership },
      })

      if (cachedHandler) {
        onChange?.({ handler: { ...cachedHandler, membership: cachedHandler.membership?.[orgId] } })
      }
    },
    [handlerCache, onChange, orgId, reg.handler, setHandlerCache]
  )

  const open = !!reg.dog?.regNo

  return (
    <CollapsibleSection
      title={t('registration.membership')}
      open={open}
      error={!open}
      helperText={open ? undefined : t('validation.registration.choose', { field: 'dog' })}
    >
      <FormGroup>
        {owners.map((owner, index) => (
          <FormControlLabel
            key={owner.key ?? index}
            disabled={disabled}
            control={
              <Checkbox
                checked={!!owner.membership}
                onChange={(e) => handleOwnerMembershipChange(owner.key, e.target.checked)}
              />
            }
            label={t('registration.isMember', {
              name: owner.name || t('registration.ownerNumber', { number: index + 1 }),
            })}
            name={`ownerIsMember_${index}`}
          />
        ))}
        {!reg.ownerHandles && (
          <FormControlLabel
            disabled={disabled}
            control={
              <Checkbox
                checked={!!reg.handler?.membership}
                onChange={(e) => handleHandlerMembershipChange(e.target.checked)}
              />
            }
            label={t('registration.isMember', { name: reg.handler?.name || t('handler') })}
            name="handlerIsMember"
          />
        )}
      </FormGroup>
    </CollapsibleSection>
  )
}

export default MembershipInfo

import type { DeepPartial, Registration } from '../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'

import CollapsibleSection from '../CollapsibleSection'

import { useDogCacheKey } from './hooks/useDogCacheKey'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly orgId: string
}

const MembershipInfo = ({ reg, disabled, onChange, orgId }: Props) => {
  const { t } = useTranslation()
  const [ownerCache, setOwnerCache] = useDogCacheKey(reg.dog?.regNo, 'owner')
  const [handlerCache, setHandlerCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const handleChange = useCallback(
    (props: DeepPartial<Pick<Registration, 'owner' | 'handler'>>) => {
      const changes = {}
      let cachedOwner, cachedHandler

      if (props.owner) {
        const membership =
          props.owner?.membership === undefined
            ? ownerCache?.membership
            : { ...ownerCache?.membership, [orgId]: props.owner.membership }
        cachedOwner = setOwnerCache({
          ...reg.owner,
          ownerHandles: reg.ownerHandles,
          ownerPays: reg.ownerPays,
          ...ownerCache,
          ...props.owner,
          membership,
        })
      }

      if (props.handler) {
        const membership =
          props.handler?.membership === undefined
            ? handlerCache?.membership
            : { ...handlerCache?.membership, [orgId]: props.handler.membership }
        cachedHandler = setHandlerCache({ ...reg.handler, ...handlerCache, ...props.handler, membership })
      }

      if (cachedOwner) {
        const { ownerHandles, ownerPays, ...owner } = cachedOwner
        Object.assign(changes, { owner: { ...owner, membership: owner.membership?.[orgId] } })
      }
      if (cachedHandler) {
        Object.assign(changes, { handler: { ...cachedHandler, membership: cachedHandler.membership?.[orgId] } })
      }

      if (Object.keys(changes).length) {
        onChange?.(changes)
      }
    },
    [handlerCache, onChange, orgId, ownerCache, setHandlerCache, setOwnerCache]
  )

  const open = !!reg.dog?.regNo

  return (
    <CollapsibleSection
      title={t('registration.membership')}
      open={open}
      error={!open}
      helperText={!open ? t('validation.registration.choose', { field: 'dog' }) : undefined}
    >
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              disabled={disabled}
              checked={reg.owner?.membership ?? false}
              onChange={(e) => handleChange({ owner: { membership: e.target.checked } })}
            />
          }
          label={t('registration.ownerIsMember')}
          name="ownerIsMember"
        />
        <FormControlLabel
          disabled={disabled || reg.ownerHandles}
          control={
            <Checkbox
              checked={reg.ownerHandles ? (reg.owner?.membership ?? false) : (reg.handler?.membership ?? false)}
              onChange={(e) => handleChange({ handler: { membership: e.target.checked } })}
            />
          }
          label={t('registration.handlerIsMember')}
          name="handlerIsMember"
        />
      </FormGroup>
    </CollapsibleSection>
  )
}

export default MembershipInfo

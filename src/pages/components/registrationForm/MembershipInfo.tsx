import type { DeepPartial, Registration } from '../../../types'
import type { DogCachedInfo } from '../../state/dog'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveOwnerSelection } from '../../../lib/registration'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import { useLocalState } from './hooks/useLocalState'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly orgId: string
}

const MembershipInfo = ({ reg, disabled, onChange, orgId }: Props) => {
  const { t } = useTranslation()
  const [handlerCache, setHandlerCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const handlingOwner = resolveOwnerSelection(reg.owners, reg.owner, reg.ownerHandles)

  // Local state for checkbox with debounced updates. useLocalState re-syncs itself when the
  // derived value changes from props — syncing through the setter here would fire the debounced
  // onChange for prop-driven changes too, rewriting the handler (and its cache) without the user
  // ever touching the checkbox.
  const [handlerIsMember, setHandlerIsMember] = useLocalState(
    reg.ownerHandles ? (handlingOwner?.membership ?? false) : (reg.handler?.membership ?? false),
    (value) => handleChange(value)
  )

  const handleChange = useCallback(
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
        <FormControlLabel
          disabled={disabled || !!reg.ownerHandles}
          control={<Checkbox checked={handlerIsMember} onChange={(e) => setHandlerIsMember(e.target.checked)} />}
          label={t('registration.handlerIsMember')}
          name="handlerIsMember"
        />
      </FormGroup>
    </CollapsibleSection>
  )
}

export default MembershipInfo

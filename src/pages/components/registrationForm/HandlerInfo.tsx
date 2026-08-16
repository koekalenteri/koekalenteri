import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
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

export function HandlerInfo({ admin, reg, disabled, error, helperText, onChange, onOpenChange, open, orgId }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson>) => {
      const membership =
        props.membership === undefined ? cache?.membership : { ...cache?.membership, [orgId]: props.membership }
      const cached = setCache({ ...cache, ...props, membership })
      if (cached) {
        onChange?.({ handler: { ...cached, membership: cached.membership?.[orgId] ?? false } })
      }
    },
    [cache, onChange, orgId, setCache]
  )

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them
    if (admin || reg.ownerHandles) return

    const cachedMembership = cache?.membership?.[orgId]
    if (cachedMembership !== undefined && reg.handler?.membership !== cachedMembership) {
      onChange?.({ handler: { ...reg.handler, membership: cachedMembership } })
    }
  }, [admin, cache, onChange, orgId, reg.handler, reg.ownerHandles])

  return (
    <CollapsibleSection
      title={t('registration.handler')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <PersonFields disabled={disabled} idPrefix="handler" onChange={handleChange} person={reg.handler} />
    </CollapsibleSection>
  )
}

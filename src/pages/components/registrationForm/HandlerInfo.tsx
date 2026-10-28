import type { DeepPartial, Registration, RegistrationPerson } from '@/types'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { selectsSomeoneElse } from '@/lib/registration'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import { PersonFields } from './PersonFields'

interface Props {
  readonly admin?: boolean
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  /**
   * Once the entry has been paid, the membership the handler may claim, by the rule the lock reads
   * (`lockedHandlerMembership`, KOE-1588): someone named in their place claims none.
   */
  readonly lockedMembership?: (handler: Pick<RegistrationPerson, 'email' | 'name'>) => boolean
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly orgId: string
}

export function HandlerInfo({
  admin,
  reg,
  disabled,
  error,
  helperText,
  lockedMembership,
  onChange,
  onOpenChange,
  open,
  orgId,
}: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'handler')

  const storedMembership = reg.handler?.membership ?? false
  const handleChange = useCallback(
    (props: Partial<Omit<RegistrationPerson, 'membership'>>) => {
      const cached = setCache({ ...cache, ...props })
      if (cached) {
        // A contact detail never changes the membership (KOE-1661): the membership section does, and
        // the effect below takes the cached one. A locked membership is the one the lock allows this
        // person, whatever the cache learned elsewhere.
        const handlerMembership = lockedMembership
          ? lockedMembership({ email: cached.email ?? '', name: cached.name ?? '' })
          : storedMembership
        onChange?.({ handler: { ...cached, membership: handlerMembership } })
      }
    },
    [cache, lockedMembership, onChange, setCache, storedMembership]
  )

  useEffect(() => {
    // Don't change registrations based on cache when secretary handles them, nor a membership the
    // participant may no longer change; an owner who handles has no separate handler's to take.
    if (admin || lockedMembership || !selectsSomeoneElse(reg.ownerHandles)) return

    const cachedMembership = cache?.membership?.[orgId]
    if (cachedMembership !== undefined && reg.handler?.membership !== cachedMembership) {
      onChange?.({ handler: { ...reg.handler, membership: cachedMembership } })
    }
  }, [admin, cache, lockedMembership, onChange, orgId, reg.handler, reg.ownerHandles])

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

import type { DeepPartial, Registration, RegistrationPerson } from '../../../types'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../CollapsibleSection'
import { useDogCacheKey } from './hooks/useDogCacheKey'
import { PersonFields } from './PersonFields'

interface Props {
  readonly reg: DeepPartial<Registration>
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: DeepPartial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export function PayerInfo({ reg, disabled, error, helperText, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [cache, setCache] = useDogCacheKey(reg.dog?.regNo, 'payer')

  const handleChange = useCallback(
    (props: Partial<RegistrationPerson>) => {
      const payer = setCache({ ...cache, ...props })
      onChange?.({ payer })
    },
    [cache, onChange, setCache]
  )

  return (
    <CollapsibleSection
      title={t('registration.payer')}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <PersonFields
        disabled={disabled}
        idPrefix="payer"
        includeLocation={false}
        onChange={handleChange}
        person={reg.payer}
      />
    </CollapsibleSection>
  )
}

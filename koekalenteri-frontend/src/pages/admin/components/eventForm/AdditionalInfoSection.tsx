import type { ChangeEvent } from 'react'
import type { SectionProps } from '../EventForm'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TextField from '@mui/material/TextField'

import CollapsibleSection from '../../../components/CollapsibleSection'

export default function AdditionalInfoSection({ disabled, event, onChange, onOpenChange, open }: SectionProps) {
  const { t } = useTranslation()

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      e.preventDefault()
      onChange?.({ description: e.target.value })
    },
    [onChange]
  )

  return (
    <CollapsibleSection title={t('event.description')} open={open} onOpenChange={onOpenChange}>
      <TextField
        disabled={disabled}
        rows={5}
        fullWidth
        multiline
        value={event.description}
        onChange={handleChange}
      ></TextField>
    </CollapsibleSection>
  )
}

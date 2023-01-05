import { ChangeEvent, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from '@mui/material'

import { CollapsibleSection } from '../../../../components'
import { SectionProps } from '../EventForm'


export default function AdditionalInfoSection({ event, onChange, onOpenChange, open }: SectionProps) {
  const { t } = useTranslation()

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onChange({ description: e.target.value })
  }, [onChange])

  return (
    <CollapsibleSection title={t('event.description')} open={open} onOpenChange={onOpenChange}>
      <TextField rows={5} fullWidth multiline value={event.description} onChange={handleChange}></TextField>
    </CollapsibleSection>
  )
}

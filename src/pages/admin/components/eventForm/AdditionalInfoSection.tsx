import type { ChangeEvent } from 'react'
import type { SectionProps } from './types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'

import CollapsibleSection from '../../../components/CollapsibleSection'

export default function AdditionalInfoSection({
  disabled,
  event,
  onChange,
  onOpenChange,
  open,
}: Readonly<SectionProps>) {
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
      <Box maxWidth={1280}>
        <TextField
          disabled={disabled}
          rows={5}
          fullWidth
          multiline
          value={event.description}
          onChange={handleChange}
        ></TextField>
      </Box>
    </CollapsibleSection>
  )
}

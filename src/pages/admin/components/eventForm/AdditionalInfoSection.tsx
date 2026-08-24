import type { ChangeEvent } from 'react'
import type { DogEvent, Patch } from '../../../../types'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalState } from '../../../../hooks/useLocalState'
import CollapsibleSection from '../../../components/CollapsibleSection'

interface Props {
  readonly disabled?: boolean
  readonly description?: string
  readonly open?: boolean
  readonly onChange?: (event: Patch<DogEvent>) => void
  readonly onOpenChange?: (value: boolean) => void
}

function AdditionalInfoSection({ disabled, description: eventDescription, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()

  const [description, setDescription] = useLocalState(eventDescription ?? '', (value) =>
    onChange?.({ description: value })
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDescription(e.target.value),
    [setDescription]
  )

  return (
    <CollapsibleSection title={t('event.description')} open={open} onOpenChange={onOpenChange}>
      <Box maxWidth={1280}>
        <TextField
          disabled={disabled}
          rows={5}
          fullWidth
          multiline
          value={description}
          onChange={handleChange}
        ></TextField>
      </Box>
    </CollapsibleSection>
  )
}

export default memo(AdditionalInfoSection)

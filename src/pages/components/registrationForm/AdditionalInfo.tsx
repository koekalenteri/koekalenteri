import type { ChangeEventHandler } from 'react'
import type { Registration } from '../../../types'
import TextField from '@mui/material/TextField'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../CollapsibleSection'
import { useLocalState } from './hooks/useLocalState'

interface Props {
  readonly disabled?: boolean
  readonly notes?: string
  readonly onChange?: (props: Partial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export function AdditionalInfo({ disabled, notes, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()

  // Use local state with debounced updates
  const [value, setValue] = useLocalState(notes ?? '', (newValue) => onChange?.({ notes: newValue }))

  // Update local state when props change
  // biome-ignore lint/correctness/useExhaustiveDependencies: setValue is stable
  useEffect(() => {
    setValue(notes ?? '')
  }, [notes])

  // Handle text field changes
  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (e) => {
      setValue(e.target.value)
    },
    [setValue]
  )

  return (
    <CollapsibleSection title={t('registration.notes')} open={open} onOpenChange={onOpenChange}>
      <TextField
        disabled={disabled}
        label={t('registration.notes')}
        multiline
        name="notes"
        onChange={handleChange}
        rows={4}
        sx={{ width: '100%' }}
        value={value}
      />
    </CollapsibleSection>
  )
}

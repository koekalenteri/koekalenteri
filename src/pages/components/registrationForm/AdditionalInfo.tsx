import type { ChangeEventHandler } from 'react'
import type { Registration } from '../../../types'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TextField from '@mui/material/TextField'

import useDebouncedCallback from '../../../hooks/useDebouncedCallback'
import CollapsibleSection from '../CollapsibleSection'

interface Props {
  readonly disabled?: boolean
  readonly notes?: string
  readonly onChange?: (props: Partial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export function AdditionalInfo({ disabled, notes, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState(notes ?? '')

  const dispatchChange = useDebouncedCallback((notes: string) => onChange?.({ notes }))

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (e) => {
      const newValue = e.target.value
      setValue(newValue)
      dispatchChange(newValue)
    },
    [dispatchChange]
  )

  useEffect(() => {
    setValue(notes ?? '')
  }, [notes])

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

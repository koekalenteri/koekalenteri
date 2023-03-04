import { ChangeEventHandler, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from '@mui/material'
import { Registration } from 'koekalenteri-shared/model'

import useDebouncedCallback from '../../../hooks/useDebouncedCallback'
import CollapsibleSection from '../CollapsibleSection'

type AdditionalInfoProps = {
  notes?: string
  onChange?: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function AdditionalInfo({ notes, onChange, onOpenChange, open }: AdditionalInfoProps) {
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
        label={t('registration.notes')}
        multiline
        onChange={handleChange}
        rows={4}
        sx={{ width: '100%' }}
        value={value}
      />
    </CollapsibleSection>
  )
}

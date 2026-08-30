import type { ChangeEventHandler } from 'react'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalState } from '../../../hooks/useLocalState'
import CollapsibleSection from '../CollapsibleSection'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  readonly notes?: string
  readonly onChange?: (notes: string) => void | Promise<void>
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

/**
 * Secretary-only notes about a registration.
 *
 * These never reach the registrant, so they save through their own endpoint instead of travelling
 * with the rest of the form: saving a registration mails the registrant about the change, which an
 * internal note must not do. Edits save as they are typed, so the section has no save button and
 * never counts as a pending change on the form's own one - which is why it has to say out loud
 * where each edit got to.
 */
export function InternalNotesInfo({ notes, onChange, onOpenChange, open }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')

  const [value, setValue, pending] = useLocalState(notes ?? '', (newValue) => {
    setStatus('saving')
    Promise.resolve(onChange?.(newValue)).then(
      () => setStatus('saved'),
      () => setStatus('error')
    )
  })

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>((e) => setValue(e.target.value), [setValue])

  // an edit still waiting out the debounce is on its way, not saved
  const shown = pending ? 'saving' : status

  return (
    <CollapsibleSection title={t('registration.secretaryNotes')} open={open} onOpenChange={onOpenChange}>
      <TextField
        error={shown === 'error'}
        helperText={t(`registration.internalNotesStatus.${shown}`)}
        label={t('registration.internalNotes')}
        multiline
        name="internalNotes"
        onChange={handleChange}
        rows={2}
        sx={{ width: '100%' }}
        value={value}
      />
    </CollapsibleSection>
  )
}

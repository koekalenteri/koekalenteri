import type { ChangeEvent } from 'react'
import type { DogEvent, Language, Patch } from '../../../../types'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalState } from '../../../../hooks/useLocalState'
import { EVENT_TRANSLATION_LANGUAGES } from '../../../../lib/event'
import CollapsibleSection from '../../../components/CollapsibleSection'

interface Props {
  readonly disabled?: boolean
  readonly description?: string
  readonly descriptions?: Partial<Record<Language, string>>
  readonly open?: boolean
  readonly onChange?: (event: Patch<DogEvent>) => void
  readonly onOpenChange?: (value: boolean) => void
}

/** A stable default for `useLocalState`, so its initial-value effect does not fire on every render. */
const EMPTY_TRANSLATIONS: Partial<Record<Language, string>> = {}

function AdditionalInfoSection({
  disabled,
  description: eventDescription,
  descriptions: eventDescriptions,
  onChange,
  onOpenChange,
  open,
}: Props) {
  const { t } = useTranslation()

  const [description, setDescription] = useLocalState(eventDescription ?? '', (value) =>
    onChange?.({ description: value })
  )
  // KOE-1263: the additional info can also be given in the other app languages; `description` stays
  // the Finnish text.
  const [descriptions, setDescriptions] = useLocalState(eventDescriptions ?? EMPTY_TRANSLATIONS, (value) =>
    onChange?.({ descriptions: value })
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDescription(e.target.value),
    [setDescription]
  )
  const handleTranslationChange = useCallback(
    (language: Language, value: string) => setDescriptions((prev) => ({ ...prev, [language]: value })),
    [setDescriptions]
  )

  return (
    <CollapsibleSection title={t('event.description')} open={open} onOpenChange={onOpenChange}>
      <Box maxWidth={1280}>
        <TextField
          disabled={disabled}
          label={`${t('event.description')} (${t('locale.fi')})`}
          rows={5}
          fullWidth
          multiline
          value={description}
          onChange={handleChange}
        ></TextField>
        {EVENT_TRANSLATION_LANGUAGES.map((language) => (
          <TextField
            key={language}
            disabled={disabled}
            label={`${t('event.description')} (${t(`locale.${language}`)})`}
            rows={5}
            fullWidth
            multiline
            sx={{ mt: 1 }}
            value={descriptions[language] ?? ''}
            onChange={(e) => handleTranslationChange(language, e.target.value)}
          />
        ))}
      </Box>
    </CollapsibleSection>
  )
}

export default memo(AdditionalInfoSection)

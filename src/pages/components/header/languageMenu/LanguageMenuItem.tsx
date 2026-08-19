import type { Language } from '../../../../types'
import MenuItem from '@mui/material/MenuItem'
import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { languageAtom } from '../../../state'

interface Props {
  readonly locale: Language
}
export function LanguageMenuItem({ locale }: Props) {
  const { t } = useTranslation()
  const [language, setLanguage] = useAtom(languageAtom)

  const handleClick = useCallback(() => setLanguage(locale), [locale, setLanguage])

  return (
    <MenuItem key={locale} selected={language === locale} onClick={handleClick}>
      {t(`locale.${locale}`)}
    </MenuItem>
  )
}

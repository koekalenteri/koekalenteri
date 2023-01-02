import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem } from '@mui/material'
import { Language } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { languageAtom } from '../../../recoil'

interface Props {
  locale: Language
}
export function LanguageMenuItem({ locale }: Props) {
  const { t } = useTranslation()
  const [language, setLanguage] = useRecoilState(languageAtom)

  const handleClick = useCallback(() => setLanguage(locale), [locale, setLanguage])

  return (
    <MenuItem
      key={locale}
      selected={language === locale}
      onClick={handleClick}
    >
      {t(`locale.${locale as Language}`)}
    </MenuItem>
  )
}

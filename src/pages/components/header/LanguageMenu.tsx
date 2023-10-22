import type { MouseEvent } from 'react'
import type { Language } from '../../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ExpandMore from '@mui/icons-material/ExpandMore'
import LanguageIcon from '@mui/icons-material/Language'
import Menu from '@mui/material/Menu'
import { useRecoilValue } from 'recoil'

import { locales } from '../../../i18n'
import { languageAtom } from '../../recoil'

import { LanguageMenuItem } from './languageMenu/LanguageMenuItem'
import AppBarButton from './AppBarButton'

export default function LanguageMenu() {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget), [setAnchorEl])
  const handleClose = useCallback(() => setAnchorEl(null), [setAnchorEl])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<LanguageIcon />} endIcon={<ExpandMore />}>
        {t(`locale.${language}`)}
      </AppBarButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose} onClick={handleClose}>
        {Object.keys(locales).map((locale) => (
          <LanguageMenuItem key={locale} locale={locale as Language} />
        ))}
      </Menu>
    </>
  )
}

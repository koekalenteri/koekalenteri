import { MouseEvent, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExpandMore, Language as LanguageIcon } from '@mui/icons-material'
import { Menu } from '@mui/material'
import { Language } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import { locales } from '../../../i18n'
import { languageAtom } from '../../recoil'

import { LanguageMenuItem } from './languageMenu/LanguageMenuItem'
import AppBarButton from "./AppBarButton"


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
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        {Object.keys(locales).map((locale) => <LanguageMenuItem key={locale} locale={locale as Language} />)}
      </Menu>
    </>
  )
}


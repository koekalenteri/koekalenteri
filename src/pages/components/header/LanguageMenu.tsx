import type { MouseEvent } from 'react'
import type { Language } from '../../../types'
import ExpandMore from '@mui/icons-material/ExpandMore'
import LanguageIcon from '@mui/icons-material/Language'
import Menu from '@mui/material/Menu'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue } from 'recoil'
import { locales } from '../../../i18n'
import { languageAtom } from '../../recoil'
import AppBarButton from './AppBarButton'
import { LanguageMenuItem } from './languageMenu/LanguageMenuItem'

export default function LanguageMenu() {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)
  const handleClose = () => setAnchorEl(null)

  return (
    <>
      <AppBarButton
        onClick={handleClick}
        startIcon={<LanguageIcon />}
        endIcon={<ExpandMore />}
        label={t('languageMenu')}
      >
        {t(`locale.${language}`)}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        {Object.keys(locales).map((locale) => (
          <LanguageMenuItem key={locale} locale={locale as Language} />
        ))}
      </Menu>
    </>
  )
}

import type { MouseEvent } from 'react'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useLocation } from 'react-router'
import { Path } from '@/routeConfig'
import AppBarButton from './AppBarButton'

export default function HelpMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)
  const handleClose = () => setAnchorEl(null)

  return (
    <>
      <AppBarButton
        onClick={handleClick}
        startIcon={<HelpOutlineOutlined />}
        endIcon={<ExpandMore />}
        label={t('support')}
      >
        {t('support')}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        <MenuItem
          component={RouterLink}
          to={Path.docs}
          onClick={handleClose}
          disabled={location.pathname.startsWith(Path.docs)}
        >
          {t('docs.title')}
        </MenuItem>
        <MenuItem
          component={RouterLink}
          to={Path.whatsNew}
          onClick={handleClose}
          disabled={location.pathname === Path.whatsNew}
        >
          {t('docs.whatsNew')}
        </MenuItem>
        <MenuItem
          href="/support"
          target="_blank"
          component="a"
          onClick={handleClose}
          disabled={location.pathname === '/support'}
        >
          {t('supportContact')}
        </MenuItem>
      </Menu>
    </>
  )
}

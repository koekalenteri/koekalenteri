import type { MouseEvent } from 'react'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
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

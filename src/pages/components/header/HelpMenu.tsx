import type { MouseEvent } from 'react'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import AppBarButton from './AppBarButton'

export default function HelpMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget), [setAnchorEl])
  const handleClose = useCallback(() => setAnchorEl(null), [setAnchorEl])

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
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
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

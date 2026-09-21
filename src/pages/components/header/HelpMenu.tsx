import type { MouseEvent } from 'react'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useLocation } from 'react-router'
import { docsPathForRoute } from '@/lib/client/docsContext'
import { Path } from '@/routeConfig'
import { helpPathAtom } from '../../state/docs'
import AppBarButton from './AppBarButton'

/**
 * The header's one way into help. The guide for the view on the screen comes first, where a guide
 * describes it (KOE-1402): as an item here rather than a button of its own, so a phone's header
 * does not show two question marks side by side.
 */
export default function HelpMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const claimed = useAtomValue(helpPathAtom)
  const contextPath = claimed ?? docsPathForRoute(location.pathname)
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
        {contextPath && (
          <MenuItem component={RouterLink} to={Path.docsPage(contextPath)} onClick={handleClose}>
            {t('docs.contextHelp')}
          </MenuItem>
        )}
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

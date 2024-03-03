import type { Theme } from '@mui/material'

import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import Accessibility from '@mui/icons-material/Accessibility'
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined'
import Event from '@mui/icons-material/Event'
import Logout from '@mui/icons-material/Logout'
import MailOutline from '@mui/icons-material/MailOutline'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SupervisorAccount from '@mui/icons-material/SupervisorAccount'
import Support from '@mui/icons-material/Support'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import { useRecoilValue } from 'recoil'

import { HEADER_HEIGHT } from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { isAdminSelector } from '../recoil'
import { useUserActions } from '../recoil/user/actions'

import DrawerItem from './sideMenu/DrawerItem'
import DrawerList from './sideMenu/DrawerList'
import MiniDrawer from './sideMenu/MiniDrawer'

interface Props {
  readonly open?: boolean
  readonly onClose: () => void
}

export function SideMenu({ open, onClose }: Props) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const lg = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'))
  const { t } = useTranslation()
  const actions = useUserActions()
  const isAdmin = useRecoilValue(isAdminSelector)

  return (
    <MiniDrawer
      variant={md ? 'permanent' : 'temporary'}
      open={lg || open}
      ModalProps={{
        keepMounted: true,
      }}
      onClose={onClose}
    >
      <Box sx={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }} />
      <DrawerList>
        <NavLink to={Path.admin.events} onClick={onClose}>
          <DrawerItem text={t('events')} icon={<Event />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.orgs} onClick={onClose}>
            <DrawerItem text={t('organizations')} icon={<Support />} />
          </NavLink>
        )}
        <NavLink to={Path.admin.judges} onClick={onClose}>
          <DrawerItem text={t('judges')} icon={<Accessibility />} />
        </NavLink>
        <NavLink to={Path.admin.officials} onClick={onClose}>
          <DrawerItem text={t('officials')} icon={<SupervisorAccount />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.eventTypes} onClick={onClose}>
            <DrawerItem text={t('eventTypes')} icon={<EmojiEventsOutlined />} />
          </NavLink>
        )}
        <NavLink to={Path.admin.users} onClick={onClose}>
          <DrawerItem text={t('users')} icon={<PersonOutline />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.emailTemplates} onClick={onClose}>
            <DrawerItem text={t('emailTemplates')} icon={<MailOutline />} />
          </NavLink>
        )}
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={async () => actions.signOut()} />
      </DrawerList>
    </MiniDrawer>
  )
}

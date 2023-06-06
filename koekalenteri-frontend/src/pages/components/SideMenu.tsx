import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import {
  Accessibility,
  EmojiEventsOutlined,
  Event,
  Logout,
  MailOutline,
  PersonOutline,
  SupervisorAccount,
  Support,
} from '@mui/icons-material'
import { Box, Divider, Theme, useMediaQuery } from '@mui/material'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { isAdminSelector } from '../recoil'
import { useUserActions } from '../recoil/user/actions'

import DrawerItem from './sideMenu/DrawerItem'
import DrawerList from './sideMenu/DrawerList'
import MiniDrawer from './sideMenu/MiniDrawer'

export function SideMenu({ open, onClose }: { open?: boolean; onClose: () => void }) {
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
      <Box sx={{ height: '36px' }} />
      <DrawerList>
        <NavLink to={Path.admin.events}>
          <DrawerItem text={t('events')} icon={<Event />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.orgs}>
            <DrawerItem text={t('organizations')} icon={<Support />} />
          </NavLink>
        )}
        <NavLink to={Path.admin.judges}>
          <DrawerItem text={t('judges')} icon={<Accessibility />} />
        </NavLink>
        <NavLink to={Path.admin.officials}>
          <DrawerItem text={t('officials')} icon={<SupervisorAccount />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.eventTypes}>
            <DrawerItem text={t('eventTypes')} icon={<EmojiEventsOutlined />} />
          </NavLink>
        )}
        <NavLink to={Path.admin.users}>
          <DrawerItem text={t('users')} icon={<PersonOutline />} />
        </NavLink>
        {isAdmin && (
          <NavLink to={Path.admin.emailTemplates}>
            <DrawerItem text={t('emailTemplates')} icon={<MailOutline />} />
          </NavLink>
        )}
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={actions.signOut} />
      </DrawerList>
    </MiniDrawer>
  )
}

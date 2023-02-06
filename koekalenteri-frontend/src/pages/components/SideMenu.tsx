import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { Accessibility, EmojiEventsOutlined, Event, Logout, MailOutline, PersonOutline, SupervisorAccount, Support } from '@mui/icons-material'
import { Divider, Theme, Toolbar, useMediaQuery } from '@mui/material'

import { Path } from '../../routeConfig'
import { useUserActions } from '../recoil/user/actions'

import DrawerItem from './sideMenu/DrawerItem'
import DrawerList from './sideMenu/DrawerList'
import MiniDrawer from './sideMenu/MiniDrawer'

export function SideMenu({ open, onClose }: { open?: boolean, onClose: () => void }) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const lg = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'))
  const { t } = useTranslation()
  const actions = useUserActions()

  return (
    <MiniDrawer
      variant={md ? 'permanent' : 'temporary'}
      open={lg || open}
      ModalProps={{
        keepMounted: true,
      }}
      onClose={onClose}
    >
      <Toolbar variant='dense' />
      <DrawerList>
        <NavLink to={Path.admin.events}><DrawerItem text={t('events')} icon={<Event />} /></NavLink>
        <NavLink to={Path.admin.orgs}><DrawerItem text={t('organizations')} icon={<Support />} /></NavLink>
        <NavLink to={Path.admin.judges}><DrawerItem text={t('judges')} icon={<Accessibility />} /></NavLink>
        <NavLink to={Path.admin.officials}><DrawerItem text={t('officials')} icon={<SupervisorAccount />} /></NavLink>
        <NavLink to={Path.admin.eventTypes}><DrawerItem text={t('eventTypes')} icon={<EmojiEventsOutlined />} /></NavLink>
        <NavLink to={Path.admin.users}><DrawerItem text={t('users')} icon={<PersonOutline />} /></NavLink>
        <NavLink to={Path.admin.emailTemplates}><DrawerItem text={t('emailTemplates')} icon={<MailOutline />} /></NavLink>
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={actions.signOut} />
      </DrawerList>
    </MiniDrawer>
  )
}

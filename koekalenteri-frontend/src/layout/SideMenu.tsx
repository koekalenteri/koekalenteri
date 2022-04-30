import { Accessibility, EmojiEventsOutlined, Event, Logout, PersonOutline, SupervisorAccount, Support } from '@mui/icons-material';
import { Divider, Theme, Toolbar, useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { DrawerItem, DrawerList, MiniDrawer } from '../components/MiniDrawer';
import { ADMIN_EVENTS, ADMIN_EVENT_TYPES, ADMIN_JUDGES, ADMIN_OFFICIALS, ADMIN_ORGS, ADMIN_USERS } from '../config';

export function SideMenu({ open, onClose }: { open?: boolean, onClose: () => void }) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
  const lg = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <MiniDrawer
      variant={md ? 'permanent' : 'temporary'}
      open={lg || open}
      ModalProps={{
        keepMounted: true
      }}
      onClose={onClose}
    >
      <Toolbar variant='dense' />
      <DrawerList>
        <NavLink to={ADMIN_EVENTS}><DrawerItem text={t('events')} icon={<Event />} /></NavLink>
        <NavLink to={ADMIN_ORGS}><DrawerItem text={t('organizations')} icon={<Support />} /></NavLink>
        <NavLink to={ADMIN_JUDGES}><DrawerItem text={t('judges')} icon={<Accessibility />} /></NavLink>
        <NavLink to={ADMIN_OFFICIALS}><DrawerItem text={t('officials')} icon={<SupervisorAccount />} /></NavLink>
        <NavLink to={ADMIN_EVENT_TYPES}><DrawerItem text={t('eventTypes')} icon={<EmojiEventsOutlined />} /></NavLink>
        <NavLink to={ADMIN_USERS}><DrawerItem text={t('users')} icon={<PersonOutline />} /></NavLink>
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={() => {
          navigate('/logout');
        }} />
      </DrawerList>
    </MiniDrawer>
  );
}

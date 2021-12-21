import { NavLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Divider, Toolbar } from '@mui/material';
import { Accessibility, Event, Logout, Menu, PersonOutline, Support } from '@mui/icons-material';
import { DrawerItem, DrawerList, MiniDrawer } from '../components/MiniDrawer';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '../stores/browser';

export function SideMenu() {
  const { t } = useTranslation();
  const [mini, setMini] = useLocalStorage('miniMenu', '0');
  const { enqueueSnackbar } = useSnackbar();
  const toggleMini = () => setMini(mini === '0' ? '1' : '0');

  return (
    <MiniDrawer
      variant="permanent"
      open={mini === '0'}
    >
      <Toolbar variant="dense" />
      <DrawerList>
        <DrawerItem text="" icon={<Menu />} onClick={toggleMini} />
        <NavLink to="/sihteeri/events"><DrawerItem text={t('events')} icon={<Event />} /></NavLink>
        <NavLink to="/sihteeri/organizations"><DrawerItem text={t('organizations')} icon={<Support />} /></NavLink>
        <NavLink to="/sihteeri/users"><DrawerItem text={t('users')} icon={<PersonOutline />} /></NavLink>
        <NavLink to="/sihteeri/judges"><DrawerItem text={t('judges')} icon={<Accessibility />} /></NavLink>
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={() => enqueueSnackbar(t('logout_failed'), { variant: 'error' })} />
      </DrawerList>
    </MiniDrawer>
  );
}

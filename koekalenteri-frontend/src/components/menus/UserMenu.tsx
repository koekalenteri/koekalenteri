import { ExpandMore, PersonOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AppBarButton } from '..';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Menu, MenuItem } from '@mui/material';
import { ADMIN_ROOT } from '../../config';
import { useSessionBoolean } from '../../stores';

export function UserMenu() {
  const { route } = useAuthenticator(context => [context.route]);
  const [greeted] = useSessionBoolean('greeted', false);
  const location = useLocation();

  if (route === 'idle' && greeted) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return route === 'authenticated' ? <LoggedInUserMenu /> : <LoginButton />;
}

function LoginButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <AppBarButton onClick={() => navigate('/login', {state: {from: location}})} startIcon={<PersonOutline />}>
        {t(`login`)}
      </AppBarButton>
    </>
  );
}

function LoggedInUserMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user, signOut } = useAuthenticator(context => [context.user]);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (...args: any[]) => {
    setAnchorEl(null);
  };

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<PersonOutline />} endIcon={<ExpandMore />}>
        {user.attributes?.name || user.attributes?.email}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        <MenuItem onClick={() => navigate(ADMIN_ROOT)}>admin</MenuItem>
        <MenuItem onClick={signOut}>{t('logout')}</MenuItem>
      </Menu>

    </>
  );
}

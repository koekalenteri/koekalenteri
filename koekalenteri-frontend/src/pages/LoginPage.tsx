import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { useSnackbar } from 'notistack';

import { useSessionBoolean } from '../stores';

export function LoginPage() {
  const { user, route } = useAuthenticator(context => [context.user, context.route]);
  const [greeted, setGreeted] = useSessionBoolean('greeted', false);
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (route === 'authenticated' && !greeted) {
      enqueueSnackbar(`Tervetuloa, ${user?.attributes?.name || user?.attributes?.email}!`, { variant: 'info' });
      setGreeted(true);
    }
  }, [enqueueSnackbar, greeted, route, setGreeted, user?.attributes?.email, user?.attributes?.name])

  useEffect(() => {
    const state: Record<string, any> = location.state as any || {};
    if (route === 'authenticated' && greeted) {
      navigate(state?.from?.pathname || '/', { replace: true });
    }
  }, [greeted, location.state, navigate, route]);

  return <Authenticator socialProviders={['google', 'facebook']} loginMechanisms={['email']} />;
}

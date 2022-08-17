import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { useSnackbar } from 'notistack';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSessionBoolean } from '../stores';

export function LoginPage() {
  const { user, route } = useAuthenticator(context => [context.user, context.route]);
  const [greeted, setGreeted] = useSessionBoolean('greeted', false);
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();
  const navigate = useNavigate();
  const state: Record<string, any> = location.state as any || {};

  useEffect(() => {
    if (route === 'authenticated') {
      if (!greeted) {
        enqueueSnackbar(`Tervetuloa, ${user.attributes?.name || user.attributes?.email}!`, { variant: 'info' });
        setGreeted(true);
      } else {
        navigate(state?.from?.pathname || '/', { replace: true });
      }
    }
  });

  return <Authenticator socialProviders={['google', 'facebook']} loginMechanisms={['email']} />;
}

import { useAuthenticator } from '@aws-amplify/ui-react';
import { useSnackbar } from 'notistack';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionBoolean } from '../stores';

export function LogoutPage() {
  const { user, signOut } = useAuthenticator(context => [context.route]);
  const [greeted, setGreeted] = useSessionBoolean('greeted', false);
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && !greeted) {
      navigate('/', {replace: true});
    }
  });

  useEffect(() => {
    if (user) {
      signOut();
    }
  });

  useEffect(() => {
    if (greeted) {
      enqueueSnackbar("Heippa!", { variant: 'info' });
      setGreeted(false);
    }
  });

  return <><p>Kirjaudutaan ulos...</p></>;
}

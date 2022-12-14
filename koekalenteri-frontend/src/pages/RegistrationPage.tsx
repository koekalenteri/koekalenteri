import { CircularProgress, Container } from '@mui/material';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useSnackbar } from 'notistack';
import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { getRegistration, putRegistration } from '../api/event';
import { LinkButton, RegistrationEventInfo, RegistrationForm } from '../components';
import { useSessionStarted, useStores } from '../stores';

export const RegistrationPage = observer(function RegistrationPage() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const params = useParams();
  const { publicStore } = useStores();
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();
  const event = toJS(publicStore.selectedEvent) as ConfirmedEventEx;

  const onSave = async (reg: Registration) => {
    try {
      const saved = await putRegistration(reg);
      publicStore.load(); // TODO: Use MobX properly
      if (!registration) {
        navigate('/', { replace: true });
      } else {
        navigate(`/registration/${saved.eventType}/${saved.eventId}/${saved.id}`);
      }
      const emails = [saved.handler.email];
      if (saved.owner.email !== saved.handler.email) {
        emails.push(saved.owner.email);
      }
      enqueueSnackbar(
        t(registration ? 'registration.modified' : 'registration.saved',
          {
            count: emails.length,
            to: emails.join("\n")
          }),
        { variant: 'success', style: { whiteSpace: 'pre-line' } }
      );

      return true;
    } catch (e: any) {
      console.error(e);
      return false;
    }
  }
  const onCancel = async () => {
    navigate(registration ? `/registration/${registration.eventType}/${registration.eventId}/${registration.id}` : '/');
    return true;
  }

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string, registrationId?: string) {
      if (registrationId) {
        setRegistration(await getRegistration(id, registrationId, abort.signal));
      }
      setLoading(false);
    }
    if (params.eventType && params.id) {
      get(params.eventType, params.id, params.registrationId);
    }
    return () => abort.abort();
  }, [params, publicStore]);

  if (!event) {
    return <CircularProgress />
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" onClick={sessionStarted ? () => navigate(-1) : undefined} text={sessionStarted ? t('goBack') : t('goHome')} />
      <Loader loading={loading}>
        <RegistrationEventInfo event={event} />
        <RegistrationForm event={event} registration={registration} className={params.class} classDate={params.date} onSave={onSave} onCancel={onCancel} />
      </Loader>
    </>
  )
})

function Loader({ loading, children }: { loading: boolean, children: ReactNode }) {
  if (loading) {
    return <Container><CircularProgress /></Container>
  }
  return <>{children}</>
}

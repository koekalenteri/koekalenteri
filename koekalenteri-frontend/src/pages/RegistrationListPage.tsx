import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Toolbar } from '@mui/material';
import { isPast, isToday } from 'date-fns';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { getRegistration, putRegistration } from '../api/event';
import { LinkButton, RegistrationEventInfo, RegistrationList } from '../components';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';

export function RegistrationListPage({cancel}: {cancel?: boolean}) {
  const params = useParams();
  const { publicStore } = useStores();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<ConfirmedEventEx>();
  const [registration, setRegistration] = useState<Registration>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string, registrationId: string) {
      const evt = await publicStore.get(eventType, id, abort.signal) as ConfirmedEventEx;
      const reg = await getRegistration(id, registrationId, abort.signal);
      setEvent(evt);
      setRegistration(reg);
      setLoading(false);
    }
    if (params.eventType && params.id && params.registrationId) {
      get(params.eventType, params.id, params.registrationId);
    }
    return () => abort.abort();
  }, [params, publicStore]);

  return (
    <>
      <Header title={t('entryList', { context: event?.eventType === 'other' ? '' : 'test' })} />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
        <LinkButton sx={{ mb: 1 }} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        <PageContent event={event} loading={loading} registration={registration} cancel={cancel}/>
      </Box>
    </>
  )
}

function PageContent({ event, loading, registration, cancel }: { event?: ConfirmedEventEx, loading: boolean, registration?: Registration, cancel?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!cancel);
  const { enqueueSnackbar } = useSnackbar();
  const handleClose = () => {
    setOpen(false);
  };
  const cancelRegistrationAction = async () => {
    if (registration) {
      setOpen(false);
      try {
        registration.cancelled = true;
        await putRegistration(registration);
        enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' });
      } catch (e: any) {
        enqueueSnackbar(e.message, { variant: 'error' });
      }
    }
  }
  useEffect(() => {
    if (open && registration?.cancelled) {
      setOpen(false);
    }
  }, [open, registration]);

  if (!event) {
    return <CircularProgress />
  }
  const disableCancel = (e: ConfirmedEventEx) => isPast(e.startDate) || isToday(e.startDate);
  return (
    <>
      <RegistrationEventInfo event={event} />
      <RegistrationList loading={loading} rows={registration ? [registration] : []} onUnregister={() => setOpen(true)} />
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          {t('registration.cancelDialog.title')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="cancel-dialog-description">
            {disableCancel(event)
              ? t('registration.cancelDialog.lateText', {
                registration,
                event,
                contact: event.contactInfo?.secretary?.phone ? event.secretary.phone : event.secretary.email
              })
              : t('registration.cancelDialog.text', { registration, event })
            }
          </DialogContentText>
          <DialogContentText id="cancel-dialog-description2" sx={{py: 1, display: disableCancel(event) ? 'none' : 'block'}}>
            {t('registration.cancelDialog.confirmation')}
          </DialogContentText>
          <DialogContentText id="cancel-dialog-description3" sx={{py: 1}}>
            <div dangerouslySetInnerHTML={{ __html: t('registration.cancelDialog.terms') }} />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelRegistrationAction} disabled={disableCancel(event)} autoFocus variant="contained">{t('registration.cancelDialog.cta')}</Button>
          <Button onClick={handleClose} variant="outlined">{t('cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

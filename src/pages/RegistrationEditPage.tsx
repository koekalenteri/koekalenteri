import type { Registration } from '../types'
import Typography from '@mui/material/Typography'
import { useAtom, useAtomValue } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { getRegistrationClass, isRegistrationContentLocked } from '../lib/registration'
import { hasChanges } from '../lib/utils'
import { HiddenPageTitle } from './components/HiddenPageTitle'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { LoadingPage } from './LoadingPage'
import { editableRegistrationByIdsAtom, registrationByIdsAtom, spaAtom, useConfirmedEvent } from './state'
import { useRegistrationActions } from './state/registration/actions'

export default function RegistrationEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const event = useConfirmedEvent(params.id)
  const ids = `${params.id ?? ''}:${params.registrationId ?? ''}:${params.editToken ?? ''}`
  const [savedRegistration, setSavedRegistration] = useAtom(registrationByIdsAtom(ids))
  const [registration, setRegistration] = useAtom(editableRegistrationByIdsAtom(ids))
  const resetRegistration = useResetAtom(editableRegistrationByIdsAtom(ids))
  const spa = useAtomValue(spaAtom)
  const actions = useRegistrationActions()
  // The rule the server refuses a change by (KOE-1584): closed from the close of entry to the trial,
  // open on the trial days, and closed once the last day has gone or the class has been judged. What a
  // picked or paid entrant may still change there is the form's own business.
  const disabled =
    !event || !savedRegistration || isRegistrationContentLocked(event, savedRegistration) || savedRegistration.cancelled
  const changes = useMemo(
    () => !disabled && !!savedRegistration && hasChanges(savedRegistration, registration),
    [registration, savedRegistration, disabled]
  )

  const handleChange = useCallback(
    (newState: Registration) => {
      if (hasChanges(registration, newState)) {
        setRegistration(newState)
      }
    },
    [registration, setRegistration]
  )

  const handleSave = useCallback(async () => {
    if (!registration || !event || disabled) {
      return
    }
    try {
      const saved = await actions.save(registration, event, savedRegistration)
      if (!saved) return
      await setSavedRegistration(saved)
      resetRegistration()
      void navigate(-1)
    } catch (error) {
      console.error(error)
    }
  }, [actions, disabled, event, navigate, registration, resetRegistration, savedRegistration, setSavedRegistration])

  const handleCancel = useCallback(() => {
    resetRegistration()
    void navigate(-1)
    return true
  }, [navigate, resetRegistration])

  useEffect(() => {
    if (event === null) {
      throw new Response('Event not found', { status: 404, statusText: t('error.eventNotFound') })
    } else if (registration === null) {
      throw new Response('Registration not found', { status: 404, statusText: t('error.registrationNotFound') })
    }
  }, [event, registration, t])

  if (!event || !registration) {
    return <LoadingPage />
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
      {/* The event header below is the page's level 2; the page's own name is for a screen reader (KOE-1519). */}
      <HiddenPageTitle>{t('entryEditTitle')}</HiddenPageTitle>
      <RegistrationEventInfo
        event={event}
        eventClass={getRegistrationClass(registration)}
        invitationAttachment={registration.invitationAttachment}
        invitationAttachmentUpdatedAt={registration.invitationAttachmentUpdatedAt}
      />
      {registration.cancelled ? (
        <Typography
          variant="h2"
          component="p"
          align="center"
          sx={{
            color: 'info.main',
          }}
        >
          {t('registration.state.cancelled')}
        </Typography>
      ) : null}
      <RegistrationForm
        changes={changes}
        disabled={disabled}
        event={event}
        registration={registration}
        savedRegistration={savedRegistration}
        className={params.class}
        classDate={params.date}
        onSave={handleSave}
        onCancel={handleCancel}
        onChange={handleChange}
      />
    </>
  )
}

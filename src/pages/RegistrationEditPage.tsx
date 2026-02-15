import type { Registration } from '../types'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'
import { hasChanges, isEntryClosed, isEventOngoing, isEventOver } from '../lib/utils'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, editableRegistrationByIdsAtom, registrationByIdsAtom, spaAtom } from './recoil'
import { useRegistrationActions } from './recoil/registration/actions'

export default function RegistrationEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const event = useRecoilValue(confirmedEventSelector(params.id))
  const ids = `${params.id ?? ''}:${params.registrationId ?? ''}`
  const [savedRegistration, setSavedRegistration] = useRecoilState(registrationByIdsAtom(ids))
  const [registration, setRegistration] = useRecoilState(editableRegistrationByIdsAtom(ids))
  const resetRegistration = useResetRecoilState(editableRegistrationByIdsAtom(ids))
  const spa = useRecoilValue(spaAtom)
  const actions = useRegistrationActions()
  const disabled =
    !event || isEntryClosed(event) || isEventOngoing(event) || isEventOver(event) || savedRegistration?.cancelled
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
      const saved = await actions.save(registration)
      setSavedRegistration(saved)
      resetRegistration()
      navigate(-1)
    } catch (error) {
      console.error(error)
    }
  }, [actions, disabled, event, navigate, registration, resetRegistration, setSavedRegistration])

  const handleCancel = useCallback(() => {
    resetRegistration()
    navigate(-1)
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
      <RegistrationEventInfo event={event} invitationAttachment={registration.invitationAttachment} />
      {registration.cancelled ? (
        <Typography variant="h5" align="center" color="info.main">
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

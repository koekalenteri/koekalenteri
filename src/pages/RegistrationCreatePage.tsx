import type { Registration } from '../types'

import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { enqueueSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { APIError } from '../api/http'
import { hasChanges, printContactInfo } from '../lib/utils'
import { Path } from '../routeConfig'

import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { useRegistrationActions } from './recoil/registration/actions'
import { confirmedEventSelector, newRegistrationAtom, spaAtom } from './recoil'

export default function RegistrationCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const event = useRecoilValue(confirmedEventSelector(params.id))
  const [registration, setRegistration] = useRecoilState(newRegistrationAtom)
  const resetRegistration = useResetRecoilState(newRegistrationAtom)
  const spa = useRecoilValue(spaAtom)
  const actions = useRegistrationActions()

  const handleChange = useCallback(
    (newState: Registration) => {
      if (!event) {
        return
      }

      if (newState.eventId !== event.id || newState.eventType !== event.eventType) {
        newState.eventId = event.id
        newState.eventType = event.eventType
      }

      if (hasChanges(registration, newState)) {
        setRegistration(newState)

        if (params.class && params.class !== newState.class) {
          navigate(Path.register(event, newState.class ?? undefined))
        }
      }
    },
    [event, navigate, params.class, registration, setRegistration]
  )

  const handleSave = useCallback(async () => {
    if (!registration || !event) {
      return
    }
    try {
      const saved = await actions.save(registration)
      resetRegistration()
      navigate(Path.payment(saved))
    } catch (error) {
      if (error instanceof APIError && error.status === 409) {
        enqueueSnackbar(
          t('registration.notifications.alreadyRegistered', {
            reg: registration,
            context: error.body?.cancelled && 'cancel',
            contact: printContactInfo(event.contactInfo?.secretary),
          }),
          {
            variant: 'info',
            persist: true,
          }
        )
        return
      }
      console.error(error)
    }
  }, [actions, event, navigate, registration, resetRegistration, t])

  const handleCancel = useCallback(() => {
    resetRegistration()
    navigate(Path.home)
    return true
  }, [navigate, resetRegistration])

  if (event === null) {
    throw new Response('Event not found', { status: 404, statusText: t('error.eventNotFound') })
  }

  if (!registration) {
    // Should not happen (tm)
    throw new Response('Registration not found', { status: 404, statusText: t('error.registrationNotFound') })
  }

  useEffect(() => {
    // make sure the registration is for correct event
    if (registration.eventId !== event.id || registration.eventType !== event.eventType) {
      setRegistration({ ...registration, eventId: event.id, eventType: event.eventType })
    }
  }, [event.eventType, event.id, registration, setRegistration])

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" back={spa} text={spa ? t('goBackToSearch') : t('goHome')} />
      <RegistrationEventInfo event={event} />
      <RegistrationForm
        changes
        event={event}
        registration={registration}
        className={params.class}
        classDate={params.date}
        onSave={handleSave}
        onCancel={handleCancel}
        onChange={handleChange}
      />
    </>
  )
}

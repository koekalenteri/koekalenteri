import type { Registration } from '../types'

import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../lib/utils'
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
          navigate(Path.register(event, newState.class))
        }
      }
    },
    [event, navigate, params.class, registration, setRegistration]
  )

  const handleSave = useCallback(() => {
    if (!registration || !event) {
      return
    }
    actions.save(registration).then(
      (saved) => {
        resetRegistration()
        navigate(Path.payment(saved))
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, event, navigate, registration, resetRegistration])

  const handleCancel = useCallback(() => {
    resetRegistration()
    navigate('/')
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

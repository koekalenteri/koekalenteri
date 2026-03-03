import type { Registration } from '../types'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'
import { APIError } from '../api/http'
import { hasChanges, isEntryOpen, isObject, printContactInfo } from '../lib/utils'
import { Path } from '../routeConfig'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { confirmedEventSelector, newRegistrationAtom, spaAtom } from './recoil'
import { useRegistrationActions } from './recoil/registration/actions'

export function Component() {
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
      if (event.paymentTime === 'confirmation') {
        navigate(Path.registration(saved))
      } else {
        navigate(Path.payment(saved))
      }
    } catch (error) {
      if (error instanceof APIError && error.status === 409) {
        enqueueSnackbar(
          t('registration.notifications.alreadyRegistered', {
            contact: printContactInfo(event.contactInfo?.secretary),
            context: isObject(error.body) && error.body.cancelled && 'cancel',
            reg: registration,
          }),
          {
            persist: true,
            variant: 'info',
          }
        )
        return
      }
      console.error(error)
    }
  }, [actions, event, navigate, registration, t])

  const handleCancel = useCallback(() => {
    resetRegistration()
    navigate(Path.home)
    return true
  }, [navigate, resetRegistration])

  if (event === null) {
    throw new Response('Event not found', { status: 404, statusText: t('error.eventNotFound') })
  }

  if (!isEntryOpen(event)) {
    throw new Response('Entry not open', { status: 410, statusText: t('error.entryNotOpen') })
  }

  if (!registration) {
    // Should not happen (tm)
    throw new Response('Registration not found', { status: 404, statusText: t('error.registrationNotFound') })
  }

  useEffect(() => {
    // make sure the registration is for correct event
    if (registration.eventId !== event.id || registration.eventType !== event.eventType) {
      setRegistration({
        ...registration,
        eventId: event.id,
        eventType: event.eventType,
        optionalCosts: undefined,
        qualifies: undefined,
        qualifyingResults: [],
        selectedCost: undefined,
      })
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

Component.displayName = 'RegistrationCreatePage'

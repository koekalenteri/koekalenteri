import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges, isEntryClosed, isEventOngoing, isEventOver } from '../utils'

import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { useRegistrationActions } from './recoil/registration/actions'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, editableRegistrationByIdsAtom, registrationByIdsAtom, spaAtom } from './recoil'

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
  const disabled = !event || isEntryClosed(event) || isEventOngoing(event) || isEventOver(event)
  const changes = useMemo(
    () => !!disabled && !!savedRegistration && hasChanges(savedRegistration, registration),
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

  const handleSave = useCallback(() => {
    if (!registration || !event || disabled) {
      return
    }
    actions.save(registration).then(
      (saved) => {
        setSavedRegistration(saved)
        resetRegistration()
        navigate(-1)
      },
      (reason) => {
        console.error(reason)
      }
    )
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
      throw new Response('Event not found', { status: 404, statusText: t('error.registrationNotFound') })
    }
  }, [event, registration, t])

  if (!event || !registration) {
    return <LoadingPage />
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
      <RegistrationEventInfo event={event} />
      <RegistrationForm
        changes={changes}
        disabled={disabled}
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

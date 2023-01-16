import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'
import { getDiff } from 'recursive-diff'

import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { useRegistrationActions } from './recoil/registration/actions'
import { eventSelector, newRegistrationAtom, spaAtom } from './recoil'

export default function RegistrationCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const event = useRecoilValue(eventSelector(params.id ?? '')) as ConfirmedEvent | undefined
  const [registration, setRegistration] = useRecoilState(newRegistrationAtom)
  const resetRegistration = useResetRecoilState(newRegistrationAtom)
  const spa = useRecoilValue(spaAtom)
  const actions = useRegistrationActions()

  const handleChange = useCallback((newState: Registration) => {
    if (event) {
      if (newState.eventId !== event.id || newState.eventType !== event.eventType) {
        newState.eventId = event.id
        newState.eventType = event.eventType
      }
    }

    const diff = getDiff(registration, newState)
    if (diff.length) {
      setRegistration(newState)
    }
  }, [event, registration, setRegistration])

  const handleSave = useCallback(async () => {
    if (!registration || !event) {
      return
    }
    const saved = await actions.save(registration)
    resetRegistration()
    navigate(`/registration/${saved.eventType}/${saved.eventId}/${saved.id}`)
  }, [actions, event, navigate, registration, resetRegistration])

  const handleCancel = useCallback(async () => {
    resetRegistration()
    navigate('/')
    return true
  }, [navigate, resetRegistration])

  const handleClick = useCallback(() => spa ? () => navigate(-1) : undefined, [spa, navigate])

  if (!event || !registration) {
    throw new Error('Event not found!')
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" onClick={handleClick} text={spa ? t('goBack') : t('goHome')} />
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


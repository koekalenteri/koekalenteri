import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { CircularProgress } from '@mui/material'
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { LinkButton, RegistrationEventInfo, RegistrationForm } from '../components'
import { useSessionStarted } from '../stores'

import { currentEvent, eventIdAtom } from './recoil/events'
import { registrationIdAtom, registrationQuery } from './recoil/registration'

export const RegistrationPage = () => {
  const navigate = useNavigate()
  const params = useParams()
  const [eventId, setEventId] = useRecoilState(eventIdAtom)
  const [registrationId, setRegistrationId] = useRecoilState(registrationIdAtom)
  const event = useRecoilValue(currentEvent) as ConfirmedEventEx | undefined
  const registration = useRecoilValue(registrationQuery)
  const [sessionStarted] = useSessionStarted()
  const { t } = useTranslation()

  const onSave = async (reg: Registration) => {
    /*
    try {
      const saved = await putRegistration(reg)
      if (!registration) {
        navigate('/', { replace: true })
      } else {
        navigate(`/registration/${saved.eventType}/${saved.eventId}/${saved.id}`)
      }
      const emails = [saved.handler.email]
      if (saved.owner.email !== saved.handler.email) {
        emails.push(saved.owner.email)
      }
      enqueueSnackbar(
        t(registration ? 'registration.modified' : 'registration.saved',
          {
            count: emails.length,
            to: emails.join("\n"),
          }),
        { variant: 'success', style: { whiteSpace: 'pre-line' } }
      )

      return true
    } catch (e: any) {
      console.error(e)
      return false
    }
    */
    return false
  }
  const onClick = useCallback(() => sessionStarted ? () => navigate(-1) : undefined, [sessionStarted, navigate])
  const onCancel = async () => {
    navigate(registration ? `/registration/${registration.eventType}/${registration.eventId}/${registration.id}` : '/')
    return true
  }

  useEffect(() => {
    if (params.id && params.registrationId) {
      if (params.id !== eventId) {
        setEventId(params.id)
      }
      if (params.registrationId !== registrationId) {
        setRegistrationId(params.registrationId)
      }
    }
  }, [eventId, params, registrationId, setEventId, setRegistrationId])

  if (!event || !registration) {
    return <CircularProgress />
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" onClick={onClick} text={sessionStarted ? t('goBack') : t('goHome')} />
      <RegistrationEventInfo event={event} />
      <RegistrationForm event={event} registration={registration} className={params.class} classDate={params.date} onSave={onSave} onCancel={onCancel} />
    </>
  )
}


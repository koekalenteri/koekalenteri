import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import RegistrationForm from './components/RegistrationForm'
import { eventSelector, newRegistrationAtom, spaAtom } from './recoil'

export const RegistrationPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const event = useRecoilValue(eventSelector(params.id ?? '')) as ConfirmedEvent | undefined
  const registration = useRecoilValue(newRegistrationAtom)
  const spa = useRecoilValue(spaAtom)

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
  const onClick = useCallback(() => spa ? () => navigate(-1) : undefined, [spa, navigate])
  const onCancel = async () => {
    navigate(registration ? `/registration/${registration.eventType}/${registration.eventId}/${registration.id}` : '/')
    return true
  }

  if (!event || !registration) {
    throw new Error('Event not found!')
  }

  return (
    <>
      <LinkButton sx={{ mb: 1 }} to="/" onClick={onClick} text={spa ? t('goBack') : t('goHome')} />
      <RegistrationEventInfo event={event} />
      <RegistrationForm event={event} registration={registration} className={params.class} classDate={params.date} onSave={onSave} onCancel={onCancel} />
    </>
  )
}


import { type Params, redirect } from 'react-router-dom'

import { getEvent } from '../api/event'
import { getRegistration, putRegistration } from '../api/registration'
import { Path } from '../routeConfig'

export const registrationInvitationLoader = async ({
  params,
  request,
}: {
  params: Params<string>
  request: Request
}) => {
  const { id, registrationId } = params

  if (!id || !registrationId) return {}

  const event = await getEvent(id, request.signal)
  const registration = await getRegistration(id, registrationId, undefined, request.signal)

  if (!event || !registration) return {}

  if (registration) {
    if (!registration.invitationRead) {
      registration.invitationRead = true
      await putRegistration(registration, undefined, request.signal)
    }
  }

  if (event.invitationAttachment) {
    return redirect(Path.invitationAttachment(registration))
  } else {
    return redirect(Path.registration(registration))
  }
}

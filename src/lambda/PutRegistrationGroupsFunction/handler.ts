import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration, JsonRegistrationGroupInfo } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import {
  getRegistrationGroupKey,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { CONFIG } from '../config'
import { getParam } from '../lib/apigw'
import { authorize, getOrigin } from '../lib/auth'
import { fixRegistrationGroups, saveGroup, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { debugProxyEvent } from '../lib/log'
import { sendTemplatedEmailToEventRegistrations } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTable, registrationTable } = CONFIG
export const dynamoDB = new CustomDynamoClient(registrationTable)

const isParticipantGroup = (group?: string) => group && group !== 'reserve' && group !== 'cancelled'

const regString = (r: JsonRegistration) =>
  `${r.group?.key}/${r.group?.number} ${r.id} ${r.dog.regNo}  ${r.dog.name} ${r.handler.name} [${r.reserveNotified}]`

const putRegistrationGroupsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)
      try {
        const user = await authorize(event)
        if (!user) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(401, 'Unauthorized', event)
        }
        const origin = getOrigin(event)
        const eventId = getParam(event, 'eventId')
        const groups: JsonRegistrationGroupInfo[] = parseJSONWithFallback(event.body, [])

        if (!groups || !Array.isArray(groups) || groups.length === 0) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(422, 'no groups', event)
        }

        const eventGroups = groups.filter((g) => g.eventId === eventId)

        if (eventGroups.length === 0) {
          console.error(`no groups after filtering by eventId='${eventId}'`, groups)
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(422, 'no groups', event)
        }

        const oldItems =
          (
            await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
              ':eventId': eventId,
            })
          )?.filter((r) => r.state === 'ready') ?? []

        // sort the items just for logging
        oldItems.sort(sortRegistrationsByDateClassTimeAndNumber)
        // console.log({ oldState: oldItems.map(regString) })

        // create a new copy of oldItems, so we can update without touching the original ones
        const updatedItems: JsonRegistration[] = oldItems.map((r) => ({ ...r }))

        // update the items in memory first
        for (const group of eventGroups) {
          const reg = updatedItems.find((r) => r.id === group.id)
          if (reg) {
            Object.assign(reg, group)
          }
        }

        // console.log({ updatedState: updatedItems.map(regString) })

        // fix numbering etc, because client might provide outdated / out of bounds info, but do not update db
        await fixRegistrationGroups(updatedItems, user, false)

        // console.log({ fixedState: updatedItems.map(regString) })

        // Finally save any changes
        for (const reg of updatedItems) {
          const oldGroup = oldItems.find((r) => r.id === reg.id)?.group
          if (reg.group?.key !== oldGroup?.key || reg.group?.number !== oldGroup?.number) {
            const reason = eventGroups.find((g) => g.id === reg.id) ? 'siirto' : 'seuraus'

            // update cancellation status, so the counts get right in updateRegistrations
            reg.cancelled = reg.group?.key === GROUP_KEY_CANCELLED

            await saveGroup(reg, oldGroup, user, reason)
            // console.log({ id: reg.id, group: reg.group, reason })
          }
        }

        // update event counts
        const confirmedEvent = await updateRegistrations(eventId, eventTable, updatedItems)
        const { classes, entries } = confirmedEvent
        const cls = updatedItems.find((item) => item.id === groups[0].id)?.class

        const emails = {
          invitedOk: [],
          invitedFailed: [],
          pickedOk: [],
          pickedFailed: [],
          reserveOk: [],
          reserveFailed: [],
          cancelledOk: [],
          cancelledFailed: [],
        }

        const oldResCan =
          oldItems?.filter((reg) => [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE].includes(getRegistrationGroupKey(reg))) ??
          []

        const picked =
          confirmedEvent.state === 'picked' || (cls && classes.find((c) => c.class === cls && c.state === 'picked'))
        const invited =
          confirmedEvent.state === 'invited' || (cls && classes.find((c) => c.class === cls && c.state === 'invited'))

        /*
        console.log({
          state: confirmedEvent.state,
          cls,
          classes,
          picked,
          invited,
        })
        */

        if (picked || invited) {
          /**
           * When event/class has already been 'picked' or 'invited', registrations moved from reserve to participants receive 'picked' email
           */
          const newParticipants = updatedItems.filter(
            (reg) =>
              reg.class === cls && isParticipantGroup(reg.group?.key) && oldResCan.find((old) => old.id === reg.id)
          )

          console.log({
            newParticipants: newParticipants.map(regString),
          })

          const { ok: pickedOk, failed: pickedFailed } = await sendTemplatedEmailToEventRegistrations(
            'picked',
            confirmedEvent,
            newParticipants,
            origin,
            '',
            user.name,
            ''
          )

          const { ok: invitedOk, failed: invitedFailed } = invited
            ? await sendTemplatedEmailToEventRegistrations(
                'invitation',
                confirmedEvent,
                newParticipants,
                origin,
                '',
                user.name,
                ''
              )
            : { ok: [], failed: [] }

          /**
           * Registrations in reserve group that moved up, receive updated 'reserve' email
           */
          const movedReserve = updatedItems.filter(
            (reg) =>
              reg.class === cls &&
              getRegistrationGroupKey(reg) === GROUP_KEY_RESERVE &&
              reg.reserveNotified &&
              oldResCan.find(
                (old) =>
                  old.id === reg.id &&
                  getRegistrationGroupKey(old) === GROUP_KEY_RESERVE &&
                  (old.group?.number ?? 999) > (reg.group?.number ?? 999)
              )
          )

          console.log({ movedReserve: movedReserve.map(regString) })

          const { ok: reserveOk, failed: reserveFailed } = await sendTemplatedEmailToEventRegistrations(
            GROUP_KEY_RESERVE,
            confirmedEvent,
            movedReserve,
            origin,
            '',
            user.name,
            ''
          )

          Object.assign(emails, {
            invitedOk,
            invitedFailed,
            pickedOk,
            pickedFailed,
            reserveOk,
            reserveFailed,
          })
        }

        /**
         * Registrations moved to cancelled group receive "cancelled" email
         */
        const cancelled = updatedItems.filter(
          (reg) =>
            reg.class === cls &&
            getRegistrationGroupKey(reg) === GROUP_KEY_CANCELLED &&
            oldResCan.find((old) => old.id === reg.id && getRegistrationGroupKey(old) !== GROUP_KEY_CANCELLED)
        )

        console.log({ cancelled: cancelled.map(regString) })

        const { ok: cancelledOk, failed: cancelledFailed } = await sendTemplatedEmailToEventRegistrations(
          'registration',
          confirmedEvent,
          cancelled,
          origin,
          '',
          user.name,
          'cancel'
        )

        Object.assign(emails, { cancelledOk, cancelledFailed })

        metricsSuccess(metrics, event.requestContext, 'putRegistrationGroups')
        return response(200, { items: updatedItems, classes, entries, ...emails }, event)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'putRegistrationGroups')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putRegistrationGroupsHandler

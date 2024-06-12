import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration, JsonRegistrationGroupInfo } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../lib/registration'
import { CONFIG } from '../config'
import { authorize, getOrigin } from '../lib/auth'
import { fixRegistrationGroups, saveGroup, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { sendTemplatedEmailToEventRegistrations } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTable, registrationTable } = CONFIG
export const dynamoDB = new CustomDynamoClient(registrationTable)

const isParticipantGroup = (group?: string) => group && group !== 'reserve' && group !== 'cancelled'

const putRegistrationGroupsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(401, 'Unauthorized', event)
        }
        const origin = getOrigin(event)
        const eventId = unescape(event.pathParameters?.eventId ?? '')
        const groups: JsonRegistrationGroupInfo[] = parseJSONWithFallback(event.body, [])

        if (!groups || !Array.isArray(groups) || groups.length === 0) {
          metricsError(metrics, event.requestContext, 'putRegistrationGroups')
          return response(422, 'no groups', event)
        }

        const eventGroups = groups.filter((g) => g.eventId === eventId)

        const oldItems =
          (
            await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
              ':eventId': eventId,
            })
          )?.filter((r) => r.state === 'ready') ?? []

        // create a new copy of oldItems, so we can update without touching the original ones
        const updatedItems = oldItems.map((r) => ({ ...r }))

        // update the items in memory first
        for (const group of eventGroups) {
          const reg = updatedItems.find((r) => r.id === group.id)
          if (reg) Object.assign(reg, group)
        }

        // fix numbering etc, because client might provide outdated / out of bounds info, but do not update db
        fixRegistrationGroups(updatedItems, user, false)

        // finally save those that were requested to be saved and actually changed
        for (const group of eventGroups) {
          const reg = updatedItems.find((r) => r.id === group.id)
          const oldGroup = oldItems.find((r) => r.id === group.id)?.group
          if (reg && (reg.group?.key !== oldGroup?.key || reg.group?.number !== oldGroup?.number)) {
            await saveGroup(reg, oldGroup, user, '(siirto)')
          }
        }

        // load fresh list of registrations (should equal to updatedItems, but better be safe)
        const items = (
          await dynamoDB.query<JsonRegistration>('eventId = :eventId', {
            ':eventId': eventId,
          })
        )?.filter((r) => r.state === 'ready')
        const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)

        // update event counts
        const confirmedEvent = await updateRegistrations(eventId, eventTable)
        const { classes, entries } = confirmedEvent
        const cls = itemsWithGroups.find((item) => item.id === groups[0].id)?.class

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

        const regString = (r: JsonRegistration) =>
          `${r.group?.key}/${r.group?.number} ${r.id} ${r.dog.regNo}  ${r.dog.name} ${r.handler.name}`

        console.log({
          state: confirmedEvent.state,
          cls,
          classes,
          picked,
          invited,
          oldItems: oldItems.map(regString),
          items: items?.map(regString),
        })

        if (picked || invited) {
          /**
           * When event/class has already been 'picked' or 'invited', registrations moved from reserve to participants receive 'picked' email
           */
          const newParticipants = itemsWithGroups.filter(
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
          const movedReserve = itemsWithGroups.filter(
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
        const cancelled = itemsWithGroups.filter(
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
        return response(200, { items: itemsWithGroups, classes, entries, ...emails }, event)
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

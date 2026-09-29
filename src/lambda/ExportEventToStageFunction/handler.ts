import type { Organizer } from '../../types'
import type { CopyImportRequest, CopyImportResult } from '../lib/eventCopy'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { CONFIG } from '../config'
import { audit, eventAuditKey } from '../lib/audit'
import { authorizeAdmin } from '../lib/auth'
import { getEvent } from '../lib/event'
import {
  assertCopyIsScrubbed,
  attachmentKeys,
  copyTargets,
  createEventCopy,
  importFunctionName,
  targetStackName,
} from '../lib/eventCopy'
import { copyFileToBucket } from '../lib/file'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { organizerTable } = CONFIG
const dynamoDB = new CustomDynamoClient(organizerTable)
const lambdaClient = new LambdaClient()

/** A synchronous invocation takes at most 6 MB; a larger copy is refused with a reason, not a 500. */
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024 - 1024

const invokeImport = async (functionName: string, request: CopyImportRequest): Promise<CopyImportResult> => {
  const payload = Buffer.from(JSON.stringify(request))
  if (payload.byteLength > MAX_PAYLOAD_BYTES) {
    throw httpError(413, { message: 'The event is too large to copy in one go' })
  }

  const result = await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, Payload: payload }))
  const body = result.Payload ? JSON.parse(Buffer.from(result.Payload).toString('utf8')) : undefined
  if (result.FunctionError) {
    throw httpError(502, { message: `The target refused the copy: ${body?.errorMessage ?? result.FunctionError}` })
  }
  return body
}

/**
 * Copies an event with its registrations into another environment (KOE-1471): prod into test or
 * dev, or between test and dev, never into prod. Every person in the copy is replaced here, in the
 * source, and the copy is checked before anything is sent; the target's import function stores it.
 */
const exportEventToStageLambda = lambda('exportEventToStage', async (event) => {
  const user = await authorizeAdmin(event)
  const { stackName, stageName } = CONFIG
  const { eventId, target } = parseJSONWithFallback<{ eventId?: string; target?: string }>(event.body)

  const targetStack = target && targetStackName(stackName, stageName, target)
  if (!eventId || !target || !copyTargets(stageName).some((stage) => stage === target) || !targetStack) {
    throw httpError(400, { message: `Cannot copy from ${stageName || 'here'} to ${target ?? 'nowhere'}` })
  }

  const source = await getEvent(eventId)
  const organizer = await dynamoDB.read<Organizer>({ id: source.organizer.id }, organizerTable)
  if (!organizer?.kcId) {
    throw httpError(412, { message: `The organizer ${source.organizer.name} has no Kennel Club number to match by` })
  }

  const copier = { email: user.email, name: user.name, ...(user.phone ? { phone: user.phone } : {}) }
  const registrations = await getRegistrationsByEventId(eventId)
  const { copy, originals } = createEventCopy({ event: source, registrations }, copier)
  try {
    assertCopyIsScrubbed(copy, copier, originals)
  } catch (error) {
    // The message names the kinds of leak only, never a value
    throw httpError(422, { message: error instanceof Error ? error.message : 'Event copy rejected' })
  }

  await Promise.all(attachmentKeys(copy).map((key) => copyFileToBucket(key, `${targetStack}-event-attachments`)))

  const result = await invokeImport(importFunctionName(targetStack), {
    copier,
    copy,
    organizerKcId: organizer.kcId,
    source: { eventId, stage: stageName },
  })

  await audit({
    auditKey: eventAuditKey(source),
    message: `Kopioitu ympäristöön ${target} (${result.eventId})`,
    user: user.name,
  })

  return response(200, { ...result, target }, event)
})

export default exportEventToStageLambda

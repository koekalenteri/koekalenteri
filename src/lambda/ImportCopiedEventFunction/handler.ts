import type { JsonDogEvent } from '../../types'
import type { CopyImportRequest, CopyImportResult } from '../lib/eventCopy'
import { nanoid } from 'nanoid'
import { eventCopiedFromAudit } from '../../lib/audit'
import { getEventSeason, stripKennelliittoLink } from '../../lib/event'
import { CONFIG } from '../config'
import { audit, eventAuditKey } from '../lib/audit'
import { withoutPlusTag } from '../lib/email'
import { saveEvent } from '../lib/event'
import { findCopyLeaks, judgeNotices } from '../lib/eventCopy'
import { logger } from '../lib/log'
import { saveRegistrations } from '../lib/registration'
import { readJudges } from '../lib/repositories/judgeRepository'
import { readOrganizers } from '../lib/repositories/organizerRepository'
import { queryUsersByEmail } from '../lib/repositories/userRepository'
import { sumNewRegistrationStatDeltas, updateOrganizerEventStats } from '../lib/stats'
import { publishEventChange } from '../lib/ws/actions'

const findAdmin = async (email: string) => {
  const users = await queryUsersByEmail(withoutPlusTag(email))
  return users.find((user) => !user.deletedAt && user.admin)
}

/**
 * Stores a copy another environment made of one of its events (KOE-1471). Exists only in test and
 * dev, and refuses to run in prod all the same. It trusts nothing it is handed: the copy's shape is
 * checked again here, and the copier must be an admin of this environment, where every mail the
 * copy sends goes to them.
 */
export default async function importCopiedEvent(request: CopyImportRequest): Promise<CopyImportResult> {
  if (CONFIG.stageName === 'prod') throw new Error('An event copy is never imported into prod')

  const { copy, copier, organizerKcId, source } = request
  // A source that has not been deployed yet may still send the link; it names a trial of its own
  // environment, so it is dropped here and never stored (KOE-1534).
  stripKennelliittoLink(copy.event)
  const leaks = findCopyLeaks(copy, copier)
  if (leaks.length) throw new Error(`Event copy rejected: ${leaks.join(', ')}`)

  if (!(await findAdmin(copier.email))) {
    throw new Error('The copier is not an admin in the target environment')
  }

  const organizers = await readOrganizers()
  const organizer = organizers.find((candidate) => candidate.kcId === organizerKcId)
  if (!organizer) throw new Error(`No organizer with Kennel Club number ${organizerKcId} in the target environment`)

  const now = new Date().toISOString()
  const eventId = nanoid(10)
  const event: JsonDogEvent = {
    ...copy.event,
    copiedFrom: { at: now, by: copier.name, eventId: source.eventId, stage: source.stage },
    createdAt: now,
    id: eventId,
    modifiedAt: now,
    name: `[Kopio: ${source.stage}] ${copy.event.name}`,
    organizer: { id: organizer.id, name: organizer.name },
    organizerId: organizer.id,
    season: getEventSeason(copy.event.startDate) ?? copy.event.season,
    // Without a fresh one the copy would not reach clients fetching what changed since their last load
    updatedAt: now,
  }
  const registrations = copy.registrations.map((registration) => ({ ...registration, eventId, updatedAt: now }))

  await publishEventChange(await saveEvent(event))
  await saveRegistrations(registrations)
  if (registrations.length) await updateOrganizerEventStats(event, sumNewRegistrationStatDeltas(registrations))

  await audit({
    auditKey: eventAuditKey(event),
    ...eventCopiedFromAudit(source.stage, source.eventId),
    user: copier.name,
  })

  const notices = judgeNotices(event, await readJudges())
  logger.info('event copy imported', { eventId, judgeNotices: notices.length, registrations: registrations.length })

  return { eventId, judges: notices }
}

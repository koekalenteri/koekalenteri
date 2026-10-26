import type { JsonDogEvent } from '../../types'
import type { CopyImportRequest, CopyImportResult } from '../lib/eventCopy'
import { nanoid } from 'nanoid'
import { eventCopiedFromAudit } from '../../lib/audit'
import { getEventSeason, stripKennelliittoLink } from '../../lib/event'
import { legacyEventDay, legacyRegistrationDays, rekeyEventDays, rekeyRegistrationDays } from '../../lib/storedDays'
import { CONFIG } from '../config'
import { audit, eventAuditKey } from '../lib/audit'
import { withoutPlusTag } from '../lib/email'
import { saveEvent } from '../lib/event'
import { findCopyLeaks, judgeNotices } from '../lib/eventCopy'
import { logger } from '../lib/log'
import { findEventCopy } from '../lib/repositories/eventRepository'
import { readJudges } from '../lib/repositories/judgeRepository'
import { readOrganizers } from '../lib/repositories/organizerRepository'
import { writeRegistrations } from '../lib/repositories/registrationRepository'
import { queryUsersByEmail } from '../lib/repositories/userRepository'
import { sumNewRegistrationStatDeltas, updateOrganizerEventStats } from '../lib/stats/stats'
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

  // A second copy of the same source would be a second event here, its entries counted again in the
  // organizer's stats (KOE-1639). A deleted copy is not found, so deleting it lets the event be copied again.
  const existing = await findEventCopy(source)
  if (existing) {
    logger.info('event copy refused: already copied', { eventId: existing.id })
    return { alreadyCopied: { eventId: existing.id, name: existing.name } }
  }

  // Days are stored as keys (KOE-1547), and a copy from an environment not yet migrated still holds
  // instants: decoded here as the migration decodes them, since this environment's migration has run.
  rekeyEventDays(copy.event, legacyEventDay)
  for (const registration of copy.registrations) rekeyRegistrationDays(registration, legacyRegistrationDays)

  const now = new Date().toISOString()
  const eventId = nanoid(10)
  const event: JsonDogEvent = {
    ...copy.event,
    copiedFrom: { at: now, by: copier.name, eventId: source.eventId, stage: source.stage },
    createdAt: now,
    id: eventId,
    modifiedAt: now,
    name: copy.event.name?.trim() ? `[Kopio: ${source.stage}] ${copy.event.name}` : `[Kopio: ${source.stage}]`,
    organizer: { id: organizer.id, name: organizer.name },
    organizerId: organizer.id,
    season: getEventSeason(copy.event.startDate) ?? copy.event.season,
    // Without a fresh one the copy would not reach clients fetching what changed since their last load
    updatedAt: now,
  }
  const registrations = copy.registrations.map((registration) => ({ ...registration, eventId, updatedAt: now }))

  await publishEventChange(await saveEvent(event))
  await writeRegistrations(registrations)
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

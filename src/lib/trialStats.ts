import type { TFunction } from 'i18next'
import type { TrialStatsEntry } from '../types/Stats'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_TRIALS } from '../types/Stats'

interface TrialStatsTableRow extends TrialStatsEntry {
  organizerName: string
  isSubtotal: boolean
}

/**
 * Groups the flat per-club/event-type entries the backend returns into a full, all-clubs table:
 * each club's own event-type rows sorted together, followed by that club's cross-type subtotal
 * (see `ALL_EVENT_TYPES_FOR_CAPACITY`), clubs ordered by name. The nationwide grand total (see
 * `ALL_ORGANIZERS_FOR_TRIALS`) is returned separately since it belongs in a table footer, not
 * among the club rows.
 */
export function buildTrialStatsTable(
  entries: TrialStatsEntry[],
  organizerName: (organizerId: string) => string
): { rows: TrialStatsTableRow[]; grandTotal?: TrialStatsEntry } {
  const byOrganizer = new Map<string, TrialStatsEntry[]>()
  const subtotalByOrganizer = new Map<string, TrialStatsEntry>()
  let grandTotal: TrialStatsEntry | undefined

  for (const entry of entries) {
    if (entry.organizerId === ALL_ORGANIZERS_FOR_TRIALS) {
      grandTotal = entry
    } else if (entry.eventType === ALL_EVENT_TYPES_FOR_CAPACITY) {
      subtotalByOrganizer.set(entry.organizerId, entry)
    } else {
      const list = byOrganizer.get(entry.organizerId) ?? []
      list.push(entry)
      byOrganizer.set(entry.organizerId, list)
    }
  }

  const organizerIds = [...byOrganizer.keys()].sort((a, b) => organizerName(a).localeCompare(organizerName(b)))

  const rows: TrialStatsTableRow[] = []
  for (const organizerId of organizerIds) {
    const name = organizerName(organizerId)
    const clubEntries = [...(byOrganizer.get(organizerId) ?? [])].sort((a, b) => a.eventType.localeCompare(b.eventType))
    for (const entry of clubEntries) rows.push({ ...entry, isSubtotal: false, organizerName: name })

    const subtotal = subtotalByOrganizer.get(organizerId)
    if (subtotal) rows.push({ ...subtotal, isSubtotal: true, organizerName: name })
  }

  return { grandTotal, rows }
}

export function trialStatsSpreadsheetRows(
  rows: TrialStatsTableRow[],
  grandTotal: TrialStatsEntry | undefined,
  t: TFunction
): (string | number)[][] {
  const totalLabel = t('stats.admin.trialStatsTotal')
  return [
    [
      t('organization'),
      t('stats.admin.eventType'),
      t('stats.admin.trialStatsEvents'),
      t('stats.admin.trialStatsPlaces'),
      t('stats.admin.trialStatsStarters'),
      t('stats.admin.trialStatsHandlers'),
    ],
    ...rows.map((row) => [
      row.organizerName,
      row.isSubtotal ? totalLabel : row.eventType,
      row.eventCount,
      row.places,
      row.starters,
      row.handlerCount,
    ]),
    ...(grandTotal
      ? [[totalLabel, '', grandTotal.eventCount, grandTotal.places, grandTotal.starters, grandTotal.handlerCount]]
      : []),
  ]
}

import type { TFunction } from 'i18next'
import type { EventBreakdownEntry } from '../types/Stats'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_EVENTS } from '../types/Stats'

interface EventBreakdownTableRow extends EventBreakdownEntry {
  organizerName: string
  isSubtotal: boolean
}

/**
 * Groups the flat per-club/event-type entries the backend returns into a full, all-clubs table:
 * each club's own event-type rows sorted together, followed by that club's cross-type subtotal
 * (see `ALL_EVENT_TYPES_FOR_CAPACITY`), clubs ordered by name. The nationwide grand total (see
 * `ALL_ORGANIZERS_FOR_EVENTS`) is returned separately since it belongs in a table footer, not
 * among the club rows.
 */
export function buildEventBreakdownTable(
  entries: EventBreakdownEntry[],
  organizerName: (organizerId: string) => string
): { rows: EventBreakdownTableRow[]; grandTotal?: EventBreakdownEntry } {
  const byOrganizer = new Map<string, EventBreakdownEntry[]>()
  const subtotalByOrganizer = new Map<string, EventBreakdownEntry>()
  let grandTotal: EventBreakdownEntry | undefined

  for (const entry of entries) {
    if (entry.organizerId === ALL_ORGANIZERS_FOR_EVENTS) {
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

  const rows: EventBreakdownTableRow[] = []
  for (const organizerId of organizerIds) {
    const name = organizerName(organizerId)
    const clubEntries = [...(byOrganizer.get(organizerId) ?? [])].sort((a, b) => a.eventType.localeCompare(b.eventType))
    for (const entry of clubEntries) rows.push({ ...entry, isSubtotal: false, organizerName: name })

    const subtotal = subtotalByOrganizer.get(organizerId)
    if (subtotal) rows.push({ ...subtotal, isSubtotal: true, organizerName: name })
  }

  return { grandTotal, rows }
}

export function eventBreakdownSpreadsheetRows(
  rows: EventBreakdownTableRow[],
  grandTotal: EventBreakdownEntry | undefined,
  t: TFunction
): (string | number)[][] {
  const totalLabel = t('stats.admin.eventBreakdownTotal')
  return [
    [
      t('organization'),
      t('stats.admin.eventType'),
      t('stats.admin.eventBreakdownEvents'),
      t('stats.admin.eventBreakdownPlaces'),
      t('stats.admin.eventBreakdownStarters'),
      t('stats.admin.eventBreakdownHandlers'),
      t('stats.admin.eventBreakdownReserve'),
      t('stats.admin.eventBreakdownCancelled'),
      t('stats.admin.eventBreakdownMembers'),
    ],
    ...rows.map((row) => [
      row.organizerName,
      row.isSubtotal ? totalLabel : row.eventType,
      row.eventCount,
      row.places,
      row.starters,
      row.handlerCount,
      row.reserve ?? 0,
      row.cancelledRegistrations ?? 0,
      row.memberStarters ?? 0,
    ]),
    ...(grandTotal
      ? [
          [
            totalLabel,
            '',
            grandTotal.eventCount,
            grandTotal.places,
            grandTotal.starters,
            grandTotal.handlerCount,
            grandTotal.reserve ?? 0,
            grandTotal.cancelledRegistrations ?? 0,
            grandTotal.memberStarters ?? 0,
          ],
        ]
      : []),
  ]
}

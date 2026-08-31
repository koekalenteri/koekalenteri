import type { ButtonProps } from '@mui/material/Button'
import type { DogEvent, Patch } from '../../../types'
import type { KcIdLookupEvent } from '../hooks/useKcIdLookup'
import Sync from '@mui/icons-material/Sync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { useTranslation } from 'react-i18next'
import { useIsOfficialEventType } from '../hooks/useIsOfficialEventType'
import { useKcIdLookup } from '../hooks/useKcIdLookup'
import { adminLinkedKcIdsAtom } from '../state'
import KcIdChoiceDialog from './eventForm/KcIdChoiceDialog'

// Unwrapped for the same reason as the event types: a button must not suspend the section around it.
// Before the events resolve nothing is known to be taken, which only loses the early warning — the
// backend still raises the conflict on save — and by the time an event's form is open they have.
const linkedKcIdsAtom = atomFamily((eventId: string | undefined) =>
  unwrap(adminLinkedKcIdsAtom(eventId), (previous) => previous ?? new Set<number>())
)

interface Props {
  readonly event: KcIdLookupEvent & { id?: string; kcId?: number | null }
  /** Also offer to swap a koetunnus the event already has, and to remove it. */
  readonly editable?: boolean
  readonly onChange?: (patch: Patch<DogEvent>) => void
  readonly variant?: ButtonProps['variant']
}

/**
 * Linking a koetunnus to an event, wherever that is offered.
 *
 * The event form and the results header both offer it, and everything around the search travels with
 * the button rather than being restated at each: which event types can have a koetunnus, which
 * koetunnukset are already spoken for, and the disambiguation dialog. Restated, they drifted — the rule
 * about official event types was widened in one copy and not the other.
 */
export const KcIdLookupButton = ({ editable, event, onChange, variant = 'contained' }: Props) => {
  const { t } = useTranslation()
  const official = useIsOfficialEventType(event.eventType)
  const linkedKcIds = useAtomValue(linkedKcIdsAtom(event.id))
  const { choices, choose, closeChoices, organizerId, remove, search, searching } = useKcIdLookup(
    event,
    onChange,
    linkedKcIds
  )
  const hasKcId = Boolean(event.kcId)

  // Nothing to link for an event type the Kennel Club does not run, and nothing to offer where a
  // koetunnus is already linked and this caller does not let it be changed.
  if (!official || (hasKcId && !editable)) return null

  const lookup = (
    <Button
      disabled={searching || !organizerId}
      onClick={search}
      size="small"
      startIcon={<Sync fontSize="small" />}
      variant={variant}
    >
      {t(hasKcId ? 'event.kcIdSwitch' : 'event.kcIdLookup')}
    </Button>
  )

  return (
    <>
      {editable && hasKcId ? (
        <Stack direction="row" spacing={1}>
          {lookup}
          <Button onClick={remove} size="small" variant="outlined">
            {t('event.kcIdRemove')}
          </Button>
        </Stack>
      ) : (
        lookup
      )}
      <KcIdChoiceDialog choices={choices} linkedKcIds={linkedKcIds} onClose={closeChoices} onSelect={choose} />
    </>
  )
}

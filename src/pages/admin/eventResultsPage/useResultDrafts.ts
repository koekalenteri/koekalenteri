import type { EventResult, Registration } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import type { RebasedEdit, ResultDraft } from './resultDraft'
import { useCallback, useMemo, useState } from 'react'
import { getRegistrationClass } from '@/lib/registration'
import { heldTasks } from '@/lib/resultTasks'
import { emptyEdit } from '../../components/stationScoring/types'
import { rebaseResultEdit } from './resultDraft'

/** One dog's draft as it would be saved, and the version it started from. */
type RebasedDraft = RebasedEdit & Pick<ResultDraft, 'version'>

/**
 * The results page's unsaved edits, each with what it started from (`ResultDraft`, KOE-1701). The page reads
 * `edits`, what the secretary has on screen, and `rebasedEdit`, what saving it would send; every way an edit
 * ends is an action here, so an edit and its start go together. `exercisesOnView` is set in a post's own view.
 */
export const useResultDrafts = (
  registrations: readonly Registration[],
  eventType: string | undefined,
  exercisesOnView: ((registration: Registration) => number[]) | undefined
) => {
  const [drafts, setDrafts] = useState<Record<string, ResultDraft>>({})

  const edits = useMemo(() => Object.fromEntries(Object.entries(drafts).map(([id, { edit }]) => [id, edit])), [drafts])

  const registrationOf = useCallback((id: string) => registrations.find((reg) => reg.id === id), [registrations])

  const rebase = useCallback(
    (draft: ResultDraft, id: string, current: EventResult | undefined): RebasedEdit => {
      const registration = registrationOf(id)
      return rebaseResultEdit(draft, current, {
        eventClass: registration && getRegistrationClass(registration),
        eventType: eventType ?? '',
      })
    },
    [eventType, registrationOf]
  )

  /** An edit that has become what is stored, on saving it as it stands, is no edit and goes. */
  const changeEdit = useCallback(
    (id: string, edit: ResultEdit, isClean: (saved: ResultEdit) => boolean) =>
      setDrafts((prev) => {
        const stored = registrationOf(id)?.eventResult
        const draft: ResultDraft = { edit, version: id in prev ? prev[id].version : stored }
        if (!isClean(rebase(draft, id, stored).edit)) return { ...prev, [id]: draft }
        const { [id]: _clean, ...rest } = prev
        return rest
      }),
    [rebase, registrationOf]
  )

  /** What saving a dog's edit would send on the given stored result. */
  const rebasedEdit = useCallback(
    (id: string, current: EventResult | undefined): RebasedDraft => {
      const draft = drafts[id] ?? { edit: emptyEdit, version: registrationOf(id)?.eventResult }
      return { ...rebase(draft, id, current), version: draft.version }
    },
    [drafts, rebase, registrationOf]
  )

  /**
   * Takes the settled dogs' edits off the screen, but for a score a post's save could not take (KOE-1696): typed
   * at another post, or at an exercise that has since moved, it stays for the whole round to save. A dog the
   * secretary left as stored in a dispute (`leftAsStored`) holds nothing: its edit carries the version just
   * turned down, which a later save would write back. Answers whether a settled dog stayed.
   */
  const settleEdits = useCallback(
    (settled: (id: string) => boolean, leftAsStored: (id: string) => boolean) => {
      const holdsScores = (id: string, draft: ResultDraft) => {
        const registration = registrationOf(id)
        if (!exercisesOnView || !registration || leftAsStored(id)) return false
        const stored = registration.eventResult
        return heldTasks(rebase(draft, id, stored).edit.tasks, stored?.tasks, exercisesOnView(registration)).length > 0
      }
      const held = Object.entries(drafts).some(([id, draft]) => settled(id) && holdsScores(id, draft))
      setDrafts((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id, draft]) => !settled(id) || holdsScores(id, draft)))
      )
      return held
    },
    [drafts, exercisesOnView, rebase, registrationOf]
  )

  /** A dog in a dispute stays on screen for the secretary to decide on. */
  const holdDisputedDogs = useCallback(
    (ids: readonly string[]) =>
      setDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          ids.map((id) => [id, prev[id] ?? { edit: emptyEdit, version: registrationOf(id)?.eventResult }])
        ),
      })),
    [registrationOf]
  )

  /** The list as the server has it: edits of dogs no longer on the sheet go, the rest stay. */
  const keepDogs = useCallback(
    (present: ReadonlySet<string>) =>
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => present.has(id)))),
    []
  )

  const cancelEdits = useCallback(() => setDrafts({}), [])

  return { cancelEdits, changeEdit, edits, holdDisputedDogs, keepDogs, rebasedEdit, settleEdits }
}

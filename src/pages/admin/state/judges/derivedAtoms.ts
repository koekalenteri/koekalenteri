import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { mapMaybe } from '@/lib/maybePromise'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminJudgeFilterAtom, adminJudgesAtom } from './atoms'

// Not an `async` getter: the event form reads this, and a list that changed under it would then
// suspend the form and swap it for its Suspense fallback.
export const adminActiveJudgesAtom = atom((get) =>
  mapMaybe(get(adminJudgesAtom), (judges) => judges.filter((item) => item.active))
)

// unwrap keeps serving the previous list synchronously while a new filter/data promise settles,
// instead of re-suspending (and remounting the page) on every filter keystroke.
export const adminFilteredJudgesAtom = unwrap(
  atom(async (get) => filterOfficialDirectory(await get(adminJudgesAtom), get(adminJudgeFilterAtom))),
  (prev) => prev ?? []
)

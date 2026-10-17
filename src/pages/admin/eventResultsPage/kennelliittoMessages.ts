import type { TFunction } from 'i18next'
import type { KcBlocker, KcDogReport, KcProblem, KcSendReport } from '@/lib/kennelliittoResults'
import type { DogLine } from './KennelliittoDogList'

/** What stops the whole trial, as the secretary reads it, with Kennelliitto's own reasons after it. */
export const blockerText = (t: TFunction, blocker: KcBlocker): string => {
  const text = t(`results.kennelliitto.blocker.${blocker.code}`, { detail: blocker.detail ?? '' })
  return blocker.virheet?.length ? `${text} ${blocker.virheet.join(' ')}` : text
}

const problemText = (t: TFunction, problem: KcProblem): string =>
  t(`results.kennelliitto.problem.${problem.code}`, { detail: problem.detail ?? '' })

/** The dog the way a list of them names it: the name and the registration number. */
export const dogLabel = (dog: Pick<KcDogReport, 'name' | 'regNo'>): string => `${dog.name} (${dog.regNo})`

/** A dog and why it is on a list: the problems of a result that cannot be sent, or what its state says. */
const dogReason = (t: TFunction, dog: KcDogReport): string =>
  dog.problems.length
    ? dog.problems.map((problem) => problemText(t, problem)).join('; ')
    : t(`results.kennelliitto.dogStatus.${dog.status}`)

/** A dog as a line of a list: who it is, and why it is there. */
export const dogLine = (t: TFunction, dog: KcDogReport): DogLine => ({
  id: dog.id,
  text: `${dogLabel(dog)}: ${dogReason(t, dog)}`,
})

/** A dog that was asked for and not sent, with where it stood. */
export const skippedLine = (t: TFunction, report: KcSendReport): DogLine => ({
  id: report.id,
  text: `${report.name ? dogLabel(report) : report.id}: ${
    report.problems?.length
      ? report.problems.map((problem) => problemText(t, problem)).join('; ')
      : t(`results.kennelliitto.dogStatus.${report.dogStatus ?? 'notRecorded'}`)
  }`,
})

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

/**
 * A foreign dog Kennelliitto did not add, so its result was not sent (KOE-1201): the sentence the
 * secretary is told, then Kennelliitto's own reasons, or the status when it gave none. The status is
 * known only in the report of the sending itself; the stored result has the reasons alone.
 */
export const dogNotAddedText = (
  t: TFunction,
  { errors, regNo, status }: { errors?: string[]; regNo: string; status?: number }
): string => {
  const text = t('results.kennelliitto.dogNotAdded', { regNo })
  if (errors?.length) return `${text} ${errors.join(' ')}`
  return status === undefined ? text : `${text} ${t('results.kennelliitto.statusUnknown', { status })}`
}

/** A dog that sending adds to Kennelliitto first, with the country it is added as (KOE-1201). */
export const createsDogLine = (dog: KcDogReport): DogLine => ({
  id: dog.id,
  text: dog.createsDog ? `${dogLabel(dog)}: ${dog.createsDog.name}` : dogLabel(dog),
})

/**
 * Why a sent dog failed: Kennelliitto's own words; else the status of a call it did not accept, since
 * then there was no answer to store and sending again is the advice; else, for a dog it accepted, that
 * its answer was not stored here (KOE-1140).
 */
const failureText = (t: TFunction, report: KcSendReport): string => {
  if (report.dogNotAdded) return dogNotAddedText(t, report)
  if (report.errors) return report.errors.join(' ')
  if (report.answerNotStored && report.status === undefined) return t('results.kennelliitto.answerNotStored')
  return t('results.kennelliitto.statusUnknown', { status: report.status ?? 0 })
}

/** A dog whose sending failed, with why. */
export const failedLine = (t: TFunction, report: KcSendReport): DogLine => ({
  id: report.id,
  text: `${dogLabel(report)}: ${failureText(t, report)}`,
})

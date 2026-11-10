import type { ExerciseScoring, JsonDogEvent } from '../types'
import { formatTypeOf } from './event'

/** What the scoring rule reads of an event: its type, the format it follows and its own setting. */
export type ExerciseScoringOwner = Partial<Pick<JsonDogEvent, 'eventType' | 'officialFormat'>> & {
  exerciseScoring?: ExerciseScoring | null
}

/** NOWT §5.3.1: "Jokaisen rastin enimmäispistemäärä on 20 pistettä". */
const NOWT_EXERCISE_MAX_POINTS = 20

const MAX_EXERCISE_POINTS = 100

/**
 * Whether the trial may score its exercises its own way: an unofficial trial that follows NOWT. The
 * official NOWT and its championship keep the rules' 20 points and whole points.
 */
const hasOwnExerciseScoring = (event: ExerciseScoringOwner): boolean =>
  !!event.eventType && formatTypeOf(event) === 'NOWT' && event.eventType !== 'NOWT'

/** The trial's own setting where it may have one; none where it no longer qualifies. */
const ownScoring = (event: ExerciseScoringOwner): ExerciseScoring | undefined =>
  hasOwnExerciseScoring(event) ? (event.exerciseScoring ?? undefined) : undefined

/** The points an exercise is worth: the trial's own maximum where it may set one, else 20. */
export const exerciseMaxPoints = (event: ExerciseScoringOwner): number =>
  ownScoring(event)?.maxPoints ?? NOWT_EXERCISE_MAX_POINTS

/** The smallest step a score moves by: a half where the trial scores in halves, else a whole point. */
export const pointStep = (event: ExerciseScoringOwner): number => (ownScoring(event)?.halfPoints ? 0.5 : 1)

/**
 * Whether points are on the step. Halves are exact binary numbers, so the test is exact, and so are the
 * sums and the prize thresholds compared against them.
 */
export const isOnPointStep = (points: number, step: number): boolean => Number.isInteger(points / step)

/**
 * The most a recalled exercise can score (§5.3.4): half its maximum, rounded down to the step, so a 30
 * becomes 15 and a 25 becomes 12, or 12.5 in halves.
 */
export const recallCeiling = (maxPoints: number, step: number): number => Math.floor(maxPoints / 2 / step) * step

/** Points as typed: "29,5" and "29.5" alike, spaces around them taken off. None where it is no number. */
export const parsePoints = (text: string): number | undefined => {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return undefined
  return Number(normalized)
}

/** Why the event save refuses a trial's exercise scoring. */
interface ExerciseScoringError {
  kind: 'notFollowingNowt' | 'badMaxPoints' | 'oddWithoutHalves'
}

/**
 * Every reason the event save refuses the exercise scoring (KOE-1736): set on a trial that may not have
 * one, with a maximum that is not a whole number from 1 to 100, or with an odd maximum in whole points,
 * whose split exercise would have parts of half a point. No setting is always taken.
 */
export const exerciseScoringErrors = (event: ExerciseScoringOwner): ExerciseScoringError[] => {
  const scoring = event.exerciseScoring
  if (!scoring) return []
  if (!hasOwnExerciseScoring(event)) return [{ kind: 'notFollowingNowt' }]
  const { maxPoints } = scoring
  const badMax =
    maxPoints !== undefined && !(Number.isInteger(maxPoints) && maxPoints >= 1 && maxPoints <= MAX_EXERCISE_POINTS)
  if (badMax) return [{ kind: 'badMaxPoints' }]
  // An exercise split in two parts is half the maximum each: an odd maximum makes halves, which whole
  // points cannot reach, so it asks for half points.
  return maxPoints !== undefined && maxPoints % 2 === 1 && !scoring.halfPoints ? [{ kind: 'oddWithoutHalves' }] : []
}

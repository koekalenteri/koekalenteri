import type { TFunction } from 'i18next'
import type { DogEvent, Registration } from '@/types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isScorableRegistration } from '@/lib/registration'
import { scoresAtPosts } from '@/lib/resultTasks'
import { formatRotationGroup, rotationCoverageErrors, rotationShapeErrors } from '@/lib/rotation'
import { adminEventRegistrationsAtom } from '../state'

type RotationLayout = Pick<DogEvent, 'classes' | 'eventType' | 'rotations' | 'stations'>

/** Every reason the rotation cannot be saved, as the secretary reads it. */
const rotationErrorMessages = (
  event: RotationLayout,
  registrations: readonly Registration[],
  t: TFunction<'translation'>
): string[] => {
  const rotations = event.rotations ?? []
  const groupName = (index: number) => (rotations[index] ? formatRotationGroup(rotations[index], t) : '')

  // The editor offers only the day's posts and keeps every group at one exercise at least, so of the
  // shape errors it can produce only these; the server refuses the others. A group without exercises is
  // one stored in dev before the running order, which the secretary removes.
  const shape = rotationShapeErrors(event).flatMap((error) => {
    const group = groupName(error.group)
    if (error.kind === 'overlap') return [t('event.rotation.error.overlap', { group, other: groupName(error.other) })]
    if (error.kind === 'range') return [t('event.rotation.error.range', { group })]
    if (error.kind === 'noExercises') return [t('event.rotation.error.noExercises', { group })]
    return []
  })

  // A number range that leaves a dog of its class out is caught here, where the dogs are known: the
  // server takes the rotation as it comes, since a number drawn later can move a dog out of it anyway.
  const dogName = (id: string) => registrations.find((registration) => registration.id === id)?.dog.name ?? ''
  const coverage = rotationCoverageErrors(event, registrations.filter(isScorableRegistration)).map((error) =>
    t('event.rotation.coverageOutside', {
      dog: dogName(error.registrationId),
      eventClass: error.class,
      number: error.number,
    })
  )

  // Two groups alike say the same thing once.
  return [...new Set([...shape, ...coverage])]
}

/**
 * Why the posts page may not save the running orders as they stand; empty when it may. A type not scored
 * by exercise has no running order editor and no reader of one, so a stored one never blocks its save.
 */
export function useRotationErrors(eventId: string, event: RotationLayout | undefined): string[] {
  const { t } = useTranslation()
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))

  return useMemo(
    () => (event && scoresAtPosts(event.eventType) ? rotationErrorMessages(event, registrations, t) : []),
    [event, registrations, t]
  )
}

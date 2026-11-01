import type { TFunction } from 'i18next'
import type { DogEvent, Registration } from '@/types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isScorableRegistration } from '@/lib/registration'
import { formatRotationGroup, rotationCoverageErrors, rotationShapeErrors } from '@/lib/rotation'
import { adminEventRegistrationsAtom } from '../state'

type RotationLayout = Pick<DogEvent, 'classes' | 'rotations' | 'stations'>

/** Every reason the rotation cannot be saved, as the secretary reads it. */
const rotationErrorMessages = (
  event: RotationLayout,
  registrations: readonly Registration[],
  t: TFunction<'translation'>
): string[] => {
  const rotations = event.rotations ?? []
  const groupName = (index: number) => (rotations[index] ? formatRotationGroup(rotations[index], t) : '')
  const postNumber = (stationId: string) => event.stations?.find((station) => station.id === stationId)?.number

  const shape = rotationShapeErrors(event).map((error) => {
    const group = groupName(error.group)
    switch (error.kind) {
      case 'overlap':
        return t('event.rotation.error.overlap', { group, other: groupName(error.other) })
      case 'postTwice':
        return t('event.rotation.error.postTwice', { group, number: postNumber(error.stationId) })
      default:
        return t(`event.rotation.error.${error.kind}`, { group })
    }
  })

  // A number range that leaves a dog of its class out is caught here, where the dogs are known: the
  // server takes the rotation as it comes, since a number drawn later can move a dog out of it anyway.
  const dogName = (id: string) => registrations.find((registration) => registration.id === id)?.dog.name ?? ''
  const coverage = rotationCoverageErrors(event, registrations.filter(isScorableRegistration)).map((error) =>
    error.number === undefined
      ? t('event.rotation.coverageNoNumber', { dog: dogName(error.registrationId), eventClass: error.class })
      : t('event.rotation.coverageOutside', {
          dog: dogName(error.registrationId),
          eventClass: error.class,
          number: error.number,
        })
  )

  return [...shape, ...coverage]
}

/** Why the Rastit page may not save the rotation as it stands; empty when it may. */
export function useRotationErrors(eventId: string, event: RotationLayout | undefined): string[] {
  const { t } = useTranslation()
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))

  return useMemo(() => (event ? rotationErrorMessages(event, registrations, t) : []), [event, registrations, t])
}

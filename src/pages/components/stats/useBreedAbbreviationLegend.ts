import type { BreedCode } from '@/types/Dog'
import { useTranslation } from 'react-i18next'
import { useBreedAbbreviation } from './useBreedAbbreviation'

/**
 * "abbreviation = full name" pairs for the breeds a chart shows abbreviated, joined for prose
 * use in an info text. Breeds without an abbreviation already appear under their full name, so
 * they need no entry; an empty string means nothing in the list is abbreviated.
 */
export function useBreedAbbreviationLegend() {
  const { t: breed } = useTranslation('breed')
  const abbreviateBreed = useBreedAbbreviation()

  return (entityIds: string[]) =>
    entityIds
      .map((entityId) => {
        const abbr = abbreviateBreed(entityId)
        const name = breed(entityId as BreedCode)
        return abbr === name ? '' : `${abbr} = ${name}`
      })
      .filter(Boolean)
      .join(', ')
}

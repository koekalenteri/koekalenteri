import type { BreedCode } from '../../../types/Dog'
import { useTranslation } from 'react-i18next'

/**
 * Breed abbreviations are stored per sex (e.g. "lbn"/"lbu"), but these charts count a breed
 * across both, so only the shared two-letter root applies; breeds outside the retriever set
 * (the "unregistered/mixed" bucket) have no abbreviation, so those fall back to the full name
 * rather than being cut down to a meaningless two letters.
 */
export function useBreedAbbreviation() {
  const { t: breed } = useTranslation('breed')
  const { t: breedAbbr } = useTranslation('breedAbbr')

  return (entityId: string) => {
    const abbr: string = breedAbbr(`${entityId}.M`, { defaultValue: '' })
    return abbr ? abbr.slice(0, 2) : breed(entityId as BreedCode)
  }
}

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

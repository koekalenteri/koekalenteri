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

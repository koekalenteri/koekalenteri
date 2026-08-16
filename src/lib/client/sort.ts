import i18next from 'i18next'

export const compareByLocalizedString = <K extends PropertyKey>(field: K) => {
  const language = i18next.language
  return (left: Record<K, string>, right: Record<K, string>): number =>
    left[field].localeCompare(right[field], language)
}

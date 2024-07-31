import pkg from '../../package.json'

export const appVersion = pkg.version

export const isEarlierVersionThan = (version: string, current: string = appVersion) => {
  const currentVersionParts = current.split('.')
  const comparedVersionParts = version.split('.')

  for (let i = 0; i < comparedVersionParts.length; i++) {
    const current = currentVersionParts[i].split('-')
    const compared = comparedVersionParts[i].split('-')

    // current includes '-beta' for example, but compared does not
    if (current.length > compared.length) return true
    // current does not include '-beta' for example, but current does not
    if (current.length < compared.length) return false
    // absolute number is smaller
    if (parseInt(current[0], 10) < parseInt(compared[0], 10)) return true
    // absolute number is larger
    if (parseInt(current[0], 10) > parseInt(compared[0], 10)) return false
    // '-alpha' vs '-beta' etc, in aplhabetical order
    if (compared.length > 1 && current[1].localeCompare(compared[1]) < 0) return true
  }
  return false
}

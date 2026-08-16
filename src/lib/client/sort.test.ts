import i18next from 'i18next'
import { compareByLocalizedString } from './sort'

describe('compareByLocalizedString', () => {
  it('sorts the selected string field using the active language', () => {
    i18next.language = 'fi'
    const items = [{ name: 'Örn' }, { name: 'Aalto' }, { name: 'Äijä' }]

    items.sort(compareByLocalizedString('name'))

    expect(items.map(({ name }) => name)).toEqual(['Aalto', 'Äijä', 'Örn'])
  })
})

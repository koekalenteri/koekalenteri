import type { Judge, Official } from '../../../types'
import { filterOfficialDirectory } from './officialDirectory'

const officials: Official[] = [
  {
    district: 'Uusimaa',
    email: 'anna@example.com',
    eventTypes: ['NOWT', 'NOME-B'],
    id: 101,
    location: 'Helsinki',
    name: 'Anna Toimitsija',
    phone: '040 1234567',
  },
  {
    district: 'Pirkanmaa',
    email: 'bertta@example.com',
    eventTypes: ['NOME-A'],
    id: 202,
    location: 'Tampere',
    name: 'Bertta Toimitsija',
    phone: '050 7654321',
  },
]

const judges: Judge[] = officials.map((official) => ({ ...official, languages: ['fi'] }))

describe('filterOfficialDirectory', () => {
  it('returns every entry when the search text is empty', () => {
    expect(filterOfficialDirectory(officials, '')).toBe(officials)
  })

  it('finds officials by an event type they hold rights for (KOE-1385)', () => {
    expect(filterOfficialDirectory(officials, 'nowt')).toEqual([officials[0]])
    expect(filterOfficialDirectory(officials, 'NOME')).toEqual(officials)
  })

  it('finds judges by event type the same way', () => {
    expect(filterOfficialDirectory(judges, 'nowt')).toEqual([judges[0]])
  })

  it.each([
    ['id', '202', 1],
    ['email', 'anna@', 0],
    ['name', 'bertta', 1],
    ['location', 'helsinki', 0],
    ['phone', '7654321', 1],
    ['district', 'pirkanmaa', 1],
  ])('matches the %s column', (_column, filter, index) => {
    expect(filterOfficialDirectory(officials, filter)).toEqual([officials[index]])
  })

  it('returns nothing when no column matches', () => {
    expect(filterOfficialDirectory(officials, 'mejä')).toEqual([])
  })
})

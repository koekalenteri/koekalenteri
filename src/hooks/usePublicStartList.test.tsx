import type { PublicRegistration, PublicStartList } from '../types'
import { renderHook } from '@testing-library/react'
import { usePublicStartList } from './usePublicStartList'

vi.mock('../api/registration', () => ({ getStartList: vi.fn() }))
vi.mock('./usePublicStartListSubscription', () => ({ usePublicStartListSubscription: vi.fn() }))

const participant = (name: string): PublicRegistration => ({
  breeder: 'Kasvattaja',
  cancelled: false,
  class: 'ALO',
  dog: { breedCode: '122', gender: 'M', name, regNo: `REG-${name}`, results: [] },
  group: { date: new Date('2025-01-01'), key: 'ALO', number: 1 },
  handler: 'Ohjaaja',
  owner: 'Omistaja',
})

describe('usePublicStartList (KOE-1516)', () => {
  it('never returns the event the page left on any render after it moves on, not even the first', () => {
    // Every render's answer, recorded during the render: an assertion after rerender only sees the
    // state once its effects have run.
    const renders: Array<Array<string | undefined>> = []
    const { rerender } = renderHook(
      ({ eventId, loaded }: { eventId: string; loaded: PublicStartList }) => {
        const rows = usePublicStartList(eventId, loaded)
        renders.push(rows.map((row) => row.dog.name))
        return rows
      },
      { initialProps: { eventId: 'event-1', loaded: { participants: [participant('Aapo')], version: 1 } } }
    )
    expect(renders.at(-1)).toEqual(['Aapo'])
    renders.length = 0

    rerender({ eventId: 'event-2', loaded: { participants: [participant('Bertta')], version: 1 } })

    expect(renders.length).toBeGreaterThan(0)
    expect(renders).not.toContainEqual(['Aapo'])
    expect(renders.at(-1)).toEqual(['Bertta'])
  })
})

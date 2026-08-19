import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'
import { adminEventTypesAtom } from '../recoil'
import { CreateEventTypeDialog } from './CreateEventTypeDialog'

vi.mock('../recoil', async () => {
  const { atom } = await vi.importActual<typeof import('recoil')>('recoil')
  const actual = await vi.importActual<typeof import('../recoil')>('../recoil')
  return {
    ...actual,
    adminEventTypesAtom: atom({ default: [], key: 'adminEventTypesAtomTest' }),
    useAdminEventTypeActions: () => ({
      save: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

describe('CreateEventTypeDialog', () => {
  it('renders translated save and cancel button labels', () => {
    render(
      <RecoilRoot initializeState={({ set }) => set(adminEventTypesAtom, [])}>
        <CreateEventTypeDialog open onClose={vi.fn()} />
      </RecoilRoot>
    )

    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
  })
})

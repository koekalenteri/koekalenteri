import { render, screen } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { adminEventTypesAtom } from '../state'
import { CreateEventTypeDialog } from './CreateEventTypeDialog'

vi.mock('../state', async () => {
  const { atom } = await vi.importActual<typeof import('jotai')>('jotai')
  const actual = await vi.importActual<typeof import('../state')>('../state')
  return {
    ...actual,
    adminEventTypesAtom: atom([]),
    useAdminEventTypeActions: () => ({
      save: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

describe('CreateEventTypeDialog', () => {
  it('renders translated save and cancel button labels', () => {
    render(
      <Provider initializeState={({ set }) => set(adminEventTypesAtom, [])}>
        <CreateEventTypeDialog open onClose={vi.fn()} />
      </Provider>
    )

    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
  })
})

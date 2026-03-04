import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'
import { adminEventTypesAtom } from '../recoil'
import { CreateEventTypeDialog } from './CreateEventTypeDialog'

jest.mock('../recoil', () => {
  const { atom } = jest.requireActual('recoil')
  const actual = jest.requireActual('../recoil')
  return {
    ...actual,
    adminEventTypesAtom: atom({ default: [], key: 'adminEventTypesAtomTest' }),
    useAdminEventTypeActions: () => ({
      save: jest.fn().mockResolvedValue(undefined),
    }),
  }
})

describe('CreateEventTypeDialog', () => {
  it('renders translated save and cancel button labels', () => {
    render(
      <RecoilRoot initializeState={({ set }) => set(adminEventTypesAtom, [])}>
        <CreateEventTypeDialog open onClose={jest.fn()} />
      </RecoilRoot>
    )

    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
  })
})

import { ThemeProvider } from '@mui/material'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { runMigrations } from '../../api/migrate'
import { getUser } from '../../api/user'
import theme from '../../assets/Theme'
import { createMatchMedia } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import { SideMenu } from './SideMenu'

const mockEnqueueSnackbar = jest.fn()

jest.mock('../../api/migrate', () => ({
  runMigrations: jest.fn(),
}))
jest.mock('../../api/user', () => ({
  getUser: jest.fn(),
}))
jest.mock('notistack', () => ({
  ...jest.requireActual('notistack'),
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}))

describe('SideMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.matchMedia = createMatchMedia(1280)
    ;(getUser as jest.Mock).mockResolvedValue({
      admin: true,
      id: 'user-id',
    })
  })

  it('shows sticky migration results after admin runs migrations', async () => {
    ;(runMigrations as jest.Mock).mockResolvedValue({
      data: [
        { count: 3, name: 'populateUpdatedAtFromModifiedAt' },
        { count: 0, name: 'fixSeasonFromStartDate' },
      ],
      status: 200,
    })

    render(
      <ThemeProvider theme={theme}>
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
          <MemoryRouter>
            <Suspense fallback={<>loading...</>}>
              <SideMenu open onClose={jest.fn()} />
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>
    )

    await userEvent.click(await screen.findByText('Run migrations'))

    await waitFor(() => expect(runMigrations).toHaveBeenCalledWith('id-token'))
    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        'Migrations completed\npopulateUpdatedAtFromModifiedAt: 3\nfixSeasonFromStartDate: 0',
        {
          persist: true,
          variant: 'success',
        }
      )
    )
  })
})

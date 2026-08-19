import { ThemeProvider } from '@mui/material'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { runMigrations } from '../../api/migrate'
import { getUser } from '../../api/user'
import theme from '../../assets/Theme'
import { createMatchMedia, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import { SideMenu } from './SideMenu'

const mockEnqueueSnackbar = vi.fn()

vi.mock('../../api/migrate', async () => ({
  runMigrations: vi.fn(),
}))
vi.mock('../../api/user', async () => ({
  getUser: vi.fn(),
}))
vi.mock('notistack', async () => ({
  ...(await vi.importActual<typeof import('notistack')>('notistack')),
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}))

describe('SideMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.matchMedia = createMatchMedia(1280)
    ;(getUser as import('vitest').Mock).mockResolvedValue({
      admin: true,
      id: 'user-id',
    })
  })

  it('shows sticky migration results after admin runs migrations', async () => {
    ;(runMigrations as import('vitest').Mock).mockResolvedValue({
      data: [
        { count: 3, name: 'populateUpdatedAtFromModifiedAt' },
        { count: 0, name: 'fixSeasonFromStartDate' },
      ],
      status: 200,
    })

    render(
      <ThemeProvider theme={theme}>
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<>loading...</>}>
              <SideMenu open onClose={vi.fn()} />
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>
    )

    const migrationButton = (await screen.findByText('Run migrations')).closest('button')
    const eventsLink = screen.getByText('events').closest('a')

    expect(migrationButton).toHaveClass('MuiListItemButton-root')
    expect(migrationButton?.querySelector('button, [role="button"]')).toBeNull()
    expect(eventsLink).toHaveClass('MuiListItemButton-root')
    expect(eventsLink?.querySelector('button, [role="button"]')).toBeNull()

    if (!migrationButton) throw new Error('Migration button not found')
    await userEvent.click(migrationButton)

    await waitFor(() => expect(runMigrations).toHaveBeenCalledWith(TEST_ID_TOKEN))
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

import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { flushPromises } from '../../test-utils/utils'
import UsersPage from './UsersPage'

jest.mock('../../api/organizer')
jest.mock('../../api/user')

describe('OrganizerListPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <UsersPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})

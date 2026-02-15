import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { flushPromises } from '../../test-utils/utils'
import StartListPage from './StartListPage'

jest.mock('../../api/event')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')
jest.mock('../../api/user')

describe('OrganizerListPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </RecoilRoot>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})

import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'
import { flushPromises, renderWithUserEvents } from '../../test-utils/utils'

import JudgeListPage from './JudgeListPage'

jest.mock('../../api/judge')
jest.mock('../../api/user')

describe('JudgeListPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container, user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <JudgeListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    user.click(screen.getAllByRole('row')[2])
    await flushPromises()

    expect(screen.getAllByRole('row')).toMatchSnapshot()
  })
})

import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getAllYearlyStats } from '../api/stats'
import theme from '../assets/Theme'
import { flushPromises } from '../test-utils/utils'
import { Component as StatsPage } from './StatsPage'

vi.mock('./components/Header', () => ({ default: () => <>header</> }))
vi.mock('../api/stats')

describe('StatsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders yearly stats once loaded', async () => {
    render(
      <ThemeProvider theme={theme}>
        <Provider>
          <MemoryRouter initialEntries={['/tilastot']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.title')
  })

  it('takes the selected year out of the all-years payload instead of re-requesting it', async () => {
    render(
      <ThemeProvider theme={theme}>
        <Provider>
          <MemoryRouter initialEntries={['/tilastot?year=2024']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    await screen.findByText('stats.title')

    // The all-years response already contains 2024's breakdowns; one request covers the page.
    expect(getAllYearlyStats).toHaveBeenCalledTimes(1)
  })
})

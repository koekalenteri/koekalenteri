import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
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
        <RecoilRoot>
          <MemoryRouter initialEntries={['/tilastot']}>
            <Suspense fallback={<div>loading...</div>}>
              <StatsPage />
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>
    )
    await flushPromises()

    await screen.findByText('stats.title')
  })
})

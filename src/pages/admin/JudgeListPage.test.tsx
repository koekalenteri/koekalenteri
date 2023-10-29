import { Suspense } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'
import { flushPromises } from '../../test-utils/utils'

import JudgeListPage from './JudgeListPage'

jest.mock('../../api/judge')
jest.mock('../../api/user')

describe('JudgeListPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container } = render(
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
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    fireEvent.click(screen.getAllByRole('row')[2])
    await flushPromises()

    expect(screen.getAllByRole('row')).toMatchSnapshot()
  })
})

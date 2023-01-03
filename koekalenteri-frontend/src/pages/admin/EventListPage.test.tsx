import { Suspense } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'
import { flushPromisesAndTimers, RecoilObserver } from '../../test-utils/utils'

import { EventListPage } from './EventListPage'
import { adminEventIdAtom } from './recoil'

jest.mock('../../api/event')
jest.mock('../../api/judge')

describe('EventListPage', () => {
  it('renders', async () => {
    const onChange = jest.fn()
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <RecoilObserver node={adminEventIdAtom} onChange={onChange} />
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <EventListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>,
    )
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()

    fireEvent.click(screen.getAllByRole('row')[1])
    await flushPromisesAndTimers()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(onChange).toHaveBeenCalledWith('test3')
  })
})

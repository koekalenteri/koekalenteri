import type { ReactNode } from 'react'

import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'

import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'

import { EventStateInfo } from './EventStateInfo'

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <MemoryRouter>{children} </MemoryRouter>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('EventStateInfo', () => {
  it('should render start list link for invited event', () => {
    const { container } = render(<EventStateInfo id={'test-id'} state={'invited'} />, { wrapper: Wrapper })

    expect(screen.getByText('Katso osallistujalista')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('should render start list link for started event', () => {
    const { container } = render(<EventStateInfo id={'test-id'} state={'started'} />, { wrapper: Wrapper })

    expect(screen.getByText('Katso osallistujalista')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('should render state info for tenatative event', () => {
    const { container } = render(<EventStateInfo id={'test-id'} state={'tentative'} />, { wrapper: Wrapper })

    expect(screen.getByText('event.states.tentative_info')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('should render state info for cancelled event', () => {
    const { container } = render(<EventStateInfo id={'test-id'} state={'cancelled'} />, { wrapper: Wrapper })

    expect(screen.getByText('event.states.cancelled_info')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('should render text', () => {
    const { container } = render(<EventStateInfo id={'test-id'} state={'confirmed'} text={'anything'} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('anything')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })
})

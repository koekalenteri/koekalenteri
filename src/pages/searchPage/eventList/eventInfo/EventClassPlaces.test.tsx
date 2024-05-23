import type { ReactNode } from 'react'
import type { MinimalEvent } from './EventClassPlaces'

import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'

import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'

import { EventClassPlaces } from './EventClassPlaces'

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
  it('should render without classes', () => {
    const event = { startDate: new Date(), classes: [], places: 3, entries: 2, members: 1 }
    const { container } = render(<EventClassPlaces event={event} eventClass={''} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })

  it('should render with one class', () => {
    const event: MinimalEvent = {
      startDate: new Date(),
      // class places, members and entries should be ignored when only one class
      classes: [{ class: 'ALO', date: new Date(), places: 0, members: 0, entries: 0 }],
      places: 3,
      entries: 2,
      members: 1,
    }
    const { container } = render(<EventClassPlaces event={event} eventClass={''} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })

  it('should render with two classes', () => {
    const event: MinimalEvent = {
      startDate: new Date(),
      // class places, members and entries should be ignored when only one class
      classes: [
        { class: 'ALO', date: new Date(), places: 3, members: 1, entries: 2 },
        { class: 'AVO', date: new Date(), places: 13, members: 11, entries: 12 },
      ],
      places: 0,
      entries: 0,
      members: 0,
    }
    const { container } = render(
      <>
        <EventClassPlaces event={event} eventClass={'ALO'} />
        <EventClassPlaces event={event} eventClass={'AVO'} />
      </>,
      {
        wrapper: Wrapper,
      }
    )

    expect(screen.getByText('ALO')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    expect(screen.getByText('AVO')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })
})

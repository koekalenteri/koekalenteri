import type { ReactNode } from 'react'
import type { MinimalEvent } from './EventClassPlaces'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
    const event = { classes: [], entries: 2, members: 1, places: 3, startDate: new Date() }
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
      // class places, members and entries should be ignored when only one class
      classes: [{ class: 'ALO', date: new Date(), entries: 0, members: 0, places: 0 }],
      entries: 2,
      members: 1,
      places: 3,
      startDate: new Date(),
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
      // class places, members and entries should be ignored when only one class
      classes: [
        { class: 'ALO', date: new Date(), entries: 2, members: 1, places: 3 },
        { class: 'AVO', date: new Date(), entries: 12, members: 11, places: 13 },
      ],
      entries: 0,
      members: 0,
      places: 0,
      startDate: new Date(),
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

  it('should fall back to the class’s day totals when capacity is tracked per day, not per class', () => {
    // Regression: an event with classes but no per-class places (capacity tracked per
    // day instead) used to show 0 places for every class row.
    const day1 = new Date('2026-11-07')
    const day2 = new Date('2026-11-08')
    const event: MinimalEvent = {
      classes: [
        { class: 'ALO', date: day1 },
        { class: 'AVO', date: day1 },
        { class: 'VOI', date: day2 },
      ],
      entries: 0,
      members: 0,
      places: 13,
      placesPerDay: { '2026-11-07': 10, '2026-11-08': 3 },
      startDate: day1,
    }
    render(
      <>
        <EventClassPlaces event={event} eventClass={'ALO'} />
        <EventClassPlaces event={event} eventClass={'VOI'} />
      </>,
      {
        wrapper: Wrapper,
      }
    )

    // ALO runs on day1, whose total is 10; VOI runs on day2, whose total is 3
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

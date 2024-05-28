import type { ReactNode } from 'react'
import type { MinimalEventForStatus } from '../../hooks/useEventStatus'

import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'

import theme from '../../assets/Theme'
import { locales } from '../../i18n'

import { EntryStatus } from './EntryStatus'

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEventInfo', () => {
  it.each<[MinimalEventForStatus, string]>([
    [
      {
        state: 'draft',
      },
      '',
    ],
    [
      {
        state: 'tentative',
      },
      '(event.states.tentative_info)',
    ],
    [
      {
        state: 'cancelled',
      },
      '(event.states.cancelled_info)',
    ],
    [
      {
        state: 'confirmed',
      },
      '',
    ],
    [
      {
        state: 'confirmed',
        entryOrigEndDate: new Date(),
      },
      '(event.states.extended_info)',
    ],
  ])('renders', async (event, text) => {
    const { container } = render(<EntryStatus event={event} />, { wrapper: Wrapper })

    expect(container.firstChild).toMatchSnapshot()
    if (text) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })
})

import type { ReactNode } from 'react'

import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'

import theme from '../../assets/Theme'
import { locales } from '../../i18n'

import { TimeLeft } from './TimeLeft'

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('TimeLeft', () => {
  it('renders with date', () => {
    const now = new Date()
    const { container } = render(<TimeLeft date={now} />, { wrapper: Wrapper })

    expect(container.firstChild).toMatchSnapshot()
    expect(screen.getByText('dateFormat.distanceLeft date')).toBeInTheDocument()
  })

  it('renders without date', () => {
    const { container } = render(<TimeLeft />, { wrapper: Wrapper })

    expect(container.firstChild).toMatchSnapshot()
    expect(container.firstChild).toBeNull()
  })
})

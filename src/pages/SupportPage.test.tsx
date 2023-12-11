import { type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'

import theme from '../assets/Theme'
import { locales } from '../i18n'
import { flushPromises } from '../test-utils/utils'

import { SupportPage } from './SupportPage'

jest.mock('./components/Header', () => () => <>header</>)

const Wrapper = ({ children }: { readonly children: ReactNode }) => {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <MemoryRouter initialEntries={['/support']}>{children}</MemoryRouter>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('SupportPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { container } = render(<SupportPage />, { wrapper: Wrapper })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})

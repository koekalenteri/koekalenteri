import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { createMatchMedia } from '../../test-utils/utils'

import RegistrationEventInfo from './RegistrationEventInfo'

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationForm', () => {
  beforeAll(() => {
    // jsdom does not have matchMedia, so inject a polyfill
    window.matchMedia = createMatchMedia(window.innerWidth)
  })

  it('renders', () => {
    const { container } = render(<RegistrationEventInfo event={eventWithStaticDates} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })
})

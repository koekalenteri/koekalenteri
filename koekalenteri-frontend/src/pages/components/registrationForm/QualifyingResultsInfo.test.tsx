import { ReactNode } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { fi } from 'date-fns/locale'

import {
  registrationWithManualResults,
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
} from '../../../__mockData__/registrations'
import { getRequirements, RegistrationClass } from '../../../rules'

import QualifyingResultsInfo from './QualifyingResultsInfo'

const Provider = ({ children }: { children: ReactNode }) => (
  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
    {children}
  </LocalizationProvider>
)

describe('QualifyingResultsInfo', () => {
  it('should render with minimal input', () => {
    const { container } = render(<QualifyingResultsInfo />, { wrapper: Provider })

    expect(container).toMatchSnapshot()
  })

  it('should render a NOME-B ALO registraton', () => {
    const reg = registrationWithStaticDatesAndClass
    const requirements = getRequirements(
      reg.eventType,
      reg.class as RegistrationClass,
      reg.dates && reg.dates.length ? reg.dates[0].date : new Date()
    )
    const { container } = render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    expect(registrationWithStaticDatesAndClass.eventType).toEqual('NOME-B')
    expect(registrationWithStaticDatesAndClass.class).toEqual('ALO')
    expect(container).toMatchSnapshot()
  })

  it('should render a NOME-B AVO registraton with manual results', () => {
    const reg = registrationWithManualResults
    const requirements = getRequirements(
      reg.eventType,
      reg.class as RegistrationClass,
      reg.dates && reg.dates.length ? reg.dates[0].date : new Date()
    )
    const { container } = render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    expect(registrationWithManualResults.eventType).toEqual('NOME-B')
    expect(registrationWithManualResults.class).toEqual('AVO')
    expect(container).toMatchSnapshot()
  })

  it('should not allow entering results for NOU test', async () => {
    const reg = registrationWithStaticDates
    const requirements = getRequirements(
      reg.eventType,
      reg.class as RegistrationClass,
      reg.dates && reg.dates.length ? reg.dates[0].date : new Date()
    )
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeDisabled()
  })

  it('should allow entering results for NOME-B rest', async () => {
    const reg = registrationWithStaticDatesAndClass
    const requirements = getRequirements(
      reg.eventType,
      reg.class as RegistrationClass,
      reg.dates && reg.dates.length ? reg.dates[0].date : new Date()
    )
    render(
      <QualifyingResultsInfo
        regNo={reg.dog.regNo}
        requirements={requirements}
        results={reg.results}
        qualifyingResults={reg.qualifyingResults}
      />,
      { wrapper: Provider }
    )

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeEnabled()
  })
})

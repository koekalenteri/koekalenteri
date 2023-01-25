import { ReactNode } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { fi } from 'date-fns/locale'
import { Registration } from 'koekalenteri-shared/model'

import { registrationWithStaticDates, registrationWithStaticDatesAndClass } from '../../../__mockData__/registrations'

import QualifyingResultsInfo from './QualifyingResultsInfo'

const Provider = ({ children }: { children: ReactNode }) => <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>{children}</LocalizationProvider>

describe('QualifyingResultsInfo', () => {
  it('should render with minimal input', () => {
    const { container } = render(<QualifyingResultsInfo reg={{} as Registration} />, { wrapper: Provider })

    expect(container).toMatchSnapshot()
  })

  it('should render a NOME-B ALO registraton', () => {
    const { container } = render(<QualifyingResultsInfo reg={registrationWithStaticDatesAndClass} />, { wrapper: Provider })

    expect(registrationWithStaticDatesAndClass.eventType).toEqual('NOME-B')
    expect(registrationWithStaticDatesAndClass.class).toEqual('ALO')
    expect(container).toMatchSnapshot()
  })

  it('should not allow entering results for NOU test', async () => {
    render(<QualifyingResultsInfo reg={registrationWithStaticDates} />, { wrapper: Provider })

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeDisabled()
  })

  it('should allow entering results for NOME-B rest', async () => {
    render(<QualifyingResultsInfo reg={registrationWithStaticDatesAndClass} />, { wrapper: Provider })

    const button = screen.getByRole('button', { name: 'registration.cta.addResult' })
    expect(button).toBeEnabled()
  })
})

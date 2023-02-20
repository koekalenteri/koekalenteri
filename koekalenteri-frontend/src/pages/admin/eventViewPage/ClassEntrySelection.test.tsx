import { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { RegistrationWithMutators } from '../recoil'

import ClassEntrySelection from './ClassEntrySelection'

jest.useFakeTimers()

function Wrapper(props: {children?: ReactNode}) {
  return (
    <RecoilRoot>
      <SnackbarProvider>
        {props.children}
      </SnackbarProvider>
    </RecoilRoot>
  )
}

describe('ClassEntrySelection', () => {
  it.each([
    [undefined],
    [[]],
    [[new Date('2022-01-01T10:00:00.000Z')]], [[new Date('2022-06-20T09:00:00.000Z')]],
  ])('given %p as dates', (dates) => {
    const { container } = render(<ClassEntrySelection eventDates={dates} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('renders with cancelled registration(s)', () => {
    const dates = [registrationWithStaticDates.dates[0].date]

    const registrations: RegistrationWithMutators[] = [
      registrationWithStaticDates,
      registrationWithStaticDatesCancelled,
    ].map(r => ({...r, setGroup: jest.fn() }))

    const { container } = render(<ClassEntrySelection eventDates={dates} registrations={registrations} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })
})

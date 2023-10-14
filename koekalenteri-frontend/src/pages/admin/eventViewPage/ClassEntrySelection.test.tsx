import type { Registration } from 'koekalenteri-shared/model'
import type { ReactNode } from 'react'

import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'

import ClassEntrySelection from './ClassEntrySelection'

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <RecoilRoot>
      <SnackbarProvider>{props.children}</SnackbarProvider>
    </RecoilRoot>
  )
}

describe('ClassEntrySelection', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it.each([[undefined], [[]], [[new Date('2022-01-01T10:00:00.000Z')]], [[new Date('2022-06-20T09:00:00.000Z')]]])(
    'given %p as dates',
    (dates) => {
      const { container } = render(<ClassEntrySelection eventId="test" eventClass="AVO" eventDates={dates} />, {
        wrapper: Wrapper,
      })
      expect(container).toMatchSnapshot()
    }
  )

  it('renders with cancelled registration(s)', () => {
    const dates = [registrationWithStaticDates.dates[0].date]

    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled].map(
      (r) => ({ ...r, setGroup: jest.fn() })
    )

    const { container } = render(
      <ClassEntrySelection eventId="test" eventClass="ALO" eventDates={dates} registrations={registrations} />,
      {
        wrapper: Wrapper,
      }
    )
    expect(container).toMatchSnapshot()
  })
})

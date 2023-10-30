import type { ReactNode } from 'react'
import type { Registration } from '../../../types'

import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { flushPromises } from '../../../test-utils/utils'

import SendMessageDialog from './SendMessageDialog'

jest.mock('../../../api/email')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <RecoilRoot>
      <SnackbarProvider>{props.children}</SnackbarProvider>
    </RecoilRoot>
  )
}

describe('SendMessageDialog', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('renders hidden when open is false', async () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={false} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { baseElement } = render(<SendMessageDialog registrations={[]} open={true} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('renders with all parameters', async () => {
    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled]

    const { baseElement } = render(
      <SendMessageDialog
        registrations={registrations}
        open={true}
        event={eventWithStaticDates}
        templateId="registration"
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })
})

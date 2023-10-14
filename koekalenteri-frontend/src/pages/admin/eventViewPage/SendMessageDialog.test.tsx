import type { Registration } from 'koekalenteri-shared/model'
import type { ReactNode } from 'react'

import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { flushPromisesAndTimers } from '../../../test-utils/utils'

import SendMessageDialog from './SendMessageDialog'

jest.useFakeTimers()
jest.mock('../../../api/email')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <RecoilRoot>
      <SnackbarProvider>{props.children}</SnackbarProvider>
    </RecoilRoot>
  )
}

describe('SendMessageDialog', () => {
  it('renders hidden when open is false', () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={false} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { baseElement } = render(<SendMessageDialog registrations={[]} open={true} event={eventWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromisesAndTimers()
    await flushPromisesAndTimers()
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
    await flushPromisesAndTimers()
    await flushPromisesAndTimers()
    expect(baseElement).toMatchSnapshot()
  })
})

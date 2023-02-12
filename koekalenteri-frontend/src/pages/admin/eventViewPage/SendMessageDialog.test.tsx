import { render } from '@testing-library/react'
import { Registration } from 'koekalenteri-shared/model'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { flushPromisesAndTimers } from '../../../test-utils/utils'

import SendMessageDialog from './SendMessageDialog'

jest.useFakeTimers()
jest.mock('../../../api/email')

describe('SendMessageDialog', () => {
  it('renders hidden when open is false', () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={false} event={eventWithStaticDates} />, { wrapper: RecoilRoot })
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={true} event={eventWithStaticDates} />, { wrapper: RecoilRoot })
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })

  it('renders with all parameters', async () => {
    const registrations: Registration[] = [
      registrationWithStaticDates,
      registrationWithStaticDatesCancelled,
    ]

    const { container } = render(<SendMessageDialog registrations={registrations} open={true} event={eventWithStaticDates} templateId='registration' />, { wrapper: RecoilRoot })
    await flushPromisesAndTimers()
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })
})

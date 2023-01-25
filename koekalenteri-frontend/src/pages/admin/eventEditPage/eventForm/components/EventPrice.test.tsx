
import { screen } from '@testing-library/react'

import { renderWithUserEvents, waitForDebounce } from '../../../../../test-utils/utils'
import { PartialEvent } from '../../EventForm'

import EventPrice from './EventPrice'

const testEvent: PartialEvent = {
  startDate: new Date(),
  endDate: new Date(),
  createdAt: new Date(),
  modifiedAt: new Date(),
  modifiedBy: 'test',
  createdBy: 'test',
  classes: [],
  judges: [],
}

describe('EventPrice', () => {
  it('should be clearable with options', async () => {
    const onChange = jest.fn()

    const { user } = renderWithUserEvents(<EventPrice id={'cost'} options={[10, 20]} event={testEvent} onChange={onChange} />)
    const input = screen.getByRole('combobox')
    await user.type(input, '5')
    await waitForDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ cost: 5 })

    await user.clear(input)
    await waitForDebounce()

    expect(onChange).toHaveBeenLastCalledWith({ cost: undefined })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

import type { PartialEvent } from '../types'

import { screen } from '@testing-library/react'

import { flushPromises, renderWithUserEvents } from '../../../../../test-utils/utils'

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
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should be clearable with options', async () => {
    const onChange = jest.fn()

    const { user } = renderWithUserEvents(
      <EventPrice id={'cost'} options={[10, 20]} event={testEvent} onChange={onChange} />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    const input = screen.getByRole('combobox')
    await user.type(input, '5')
    await flushPromises()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ cost: 5 })

    await user.clear(input)
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ cost: undefined })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

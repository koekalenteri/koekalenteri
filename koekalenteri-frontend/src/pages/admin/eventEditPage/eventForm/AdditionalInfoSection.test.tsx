import { render, screen } from '@testing-library/react'

import { renderWithUserEvents } from '../../../../test-utils/utils'

import AdditionalInfoSection from './AdditionalInfoSection'

describe('AdditionalInfoSection', () => {
  it('should render', () => {
    const testEvent = {
      id: 'test',
      judges: [],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
      description: 'Test!',
    }
    const changeHandler = jest.fn()
    const { container } = render(<AdditionalInfoSection event={testEvent} onChange={changeHandler} open />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange', async () => {
    const testEvent = {
      id: 'test',
      judges: [],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const changeHandler = jest.fn((props) => Object.assign(testEvent, props))

    const { user } = renderWithUserEvents(<AdditionalInfoSection event={testEvent} onChange={changeHandler} open />)

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('')

    await user.type(input, 'Testing!')

    expect(input).toHaveValue('Testing!')
    expect(changeHandler).toHaveBeenCalledTimes(8)
    expect(changeHandler).toHaveBeenLastCalledWith({ description: 'Testing!' })
  })
})

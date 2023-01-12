import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AutocompleteSingle from './AutocompleteSingle'

describe('AutocompleteSingle', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(console.debug)
    jest.spyOn(console, 'error').mockImplementation(console.debug)
  })

  afterEach(() => {
    expect(console.warn).toHaveBeenCalledTimes(0)
    expect(console.error).toHaveBeenCalledTimes(0)
  })

  it('should render with minimal information', () => {
    const { container } = render(<AutocompleteSingle options={['A', 'B']} label={'test-label'} />)
    expect(container).toMatchSnapshot()
  })

  it('should render helperText', () => {
    const { container } = render(<AutocompleteSingle options={['test-a', 'test-b']} label={'test-label'} helperText={'helper text'} />)
    expect(container).toMatchSnapshot()
  })

  it('should render helperText with error state', () => {
    const { container } = render(<AutocompleteSingle options={['test-a', 'test-b']} label={'test-label'} helperText={'helper text'} error />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const user = userEvent.setup()

    const onChange = jest.fn()
    render(<AutocompleteSingle options={['test-a', 'test-b']} label={'test-label'} onChange={onChange} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'b{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }), 'test-b', 'selectOption', { option: 'test-b' })
  })
})

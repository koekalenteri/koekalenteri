import { render, screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import { InternalNotesInfo } from './InternalNotesInfo'

describe('InternalNotesInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<InternalNotesInfo />)
    expect(container).toMatchSnapshot()
  })

  it('should render with text', () => {
    const { container } = render(<InternalNotesInfo notes="secretary note" />)
    expect(container).toMatchSnapshot()
  })

  it('should rerender with new value', () => {
    const { container, rerender } = render(<InternalNotesInfo notes="note a" />)
    rerender(<InternalNotesInfo notes="note b" />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange with the notes as plain text', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(<InternalNotesInfo notes="note" onChange={onChange} />, undefined, {
      advanceTimers: vi.advanceTimersByTime,
    })

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith('')

    onChange.mockReset()

    await user.type(input, 'needs help in english')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith('needs help in english')
  })

  it('should not call onChange when the notes change from the outside', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<InternalNotesInfo notes="note" onChange={onChange} />)

    rerender(<InternalNotesInfo notes="changed elsewhere" onChange={onChange} />)
    await flushPromises()

    expect(onChange).not.toHaveBeenCalled()
  })
})

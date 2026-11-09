import { act, fireEvent, render, screen } from '@testing-library/react'
import useDebouncedCallback from './useDebouncedCallback'

interface FieldProps {
  readonly onChange: (value: string) => void
}

const Field = ({ onChange }: FieldProps) => {
  const debounced = useDebouncedCallback(onChange, 300, { flushOnBlur: true })
  return <input aria-label="field" onChange={(e) => debounced(e.target.value)} />
}

interface FormProps extends FieldProps {
  readonly open: boolean
}

const Form = ({ onChange, open }: FormProps) => (
  <>
    <button type="button">next</button>
    {open && <Field onChange={onChange} />}
  </>
)

const type = (value: string) => {
  const field = screen.getByRole('textbox', { name: 'field' })
  field.focus()
  fireEvent.change(field, { target: { value } })
}

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('delivers the last call once the wait is over', () => {
    const onChange = vi.fn()
    render(<Form onChange={onChange} open />)
    type('a')
    type('ab')
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ab')
  })

  // A value typed just before the next field or Tallenna is clicked is there for that click (KOE-1483).
  it('delivers a pending call at once when focus leaves the field', () => {
    const onChange = vi.fn()
    render(<Form onChange={onChange} open />)
    type('a')

    act(() => screen.getByRole('button', { name: 'next' }).focus())
    expect(onChange).toHaveBeenCalledWith('a')

    act(() => vi.advanceTimersByTime(300))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  // The timer goes with the field: only a focusout delivers the value then.
  it('drops a call still pending when the field goes without a focusout', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Form onChange={onChange} open />)
    type('a')

    rerender(<Form onChange={onChange} open={false} />)
    act(() => vi.advanceTimersByTime(300))
    expect(onChange).not.toHaveBeenCalled()
  })

  // Chrome takes the focus off a field as the field is removed, and fires focusout on it while it is still
  // in the page; jsdom does not. A value typed just before the field goes is then still delivered: an
  // internal note saves as it is typed, and closing its dialog must not lose it (KOE-1700).
  it('delivers a pending call when the browser moves focus off the field as it removes it', () => {
    const removeChild = Node.prototype.removeChild
    const blurOnRemove = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(
      this: Node,
      child: T
    ) {
      const focused = document.activeElement
      if (focused && child.contains(focused)) focused.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      return removeChild.call(this, child)
    })
    const onChange = vi.fn()
    const { rerender } = render(<Form onChange={onChange} open />)
    type('a')

    rerender(<Form onChange={onChange} open={false} />)
    blurOnRemove.mockRestore()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('a')
  })
})

import { releaseFocus } from './focus'

describe('releaseFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('takes the focus off the focused field, which sees it go', () => {
    const field = document.createElement('input')
    document.body.append(field)
    const focusout = vi.fn()
    field.addEventListener('focusout', focusout)
    field.focus()

    releaseFocus()
    expect(document.activeElement).toBe(document.body)
    expect(focusout).toHaveBeenCalledTimes(1)
  })

  it('does nothing when nothing has the focus', () => {
    expect(() => releaseFocus()).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })
})

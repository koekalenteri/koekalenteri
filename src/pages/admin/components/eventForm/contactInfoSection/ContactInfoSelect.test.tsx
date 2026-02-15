import { render, screen } from '@testing-library/react'
import { renderWithUserEvents } from '../../../../../test-utils/utils'
import ContactInfoSelect from './ContactInfoSelect'

describe('PersonContactInfo', () => {
  const defaults = { email: 'test email', name: 'test name', phone: 'test phone' }

  it('should render', () => {
    const changeHandler = jest.fn()
    const { container } = render(<ContactInfoSelect defaults={defaults} name="official" onChange={changeHandler} />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange when uncontrolled', async () => {
    const changeHandler = jest.fn()

    const { user } = renderWithUserEvents(
      <ContactInfoSelect defaults={defaults} name="uncontrolled" onChange={changeHandler} />
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const nameInput = screen.getByRole('checkbox', { name: 'contact.name' })
    const emailInput = screen.getByRole('checkbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('checkbox', { name: 'contact.phone' })

    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()

    await user.click(nameInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: '', name: defaults.name, phone: '' })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', {
      email: defaults.email,
      name: defaults.name,
      phone: '',
    })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', defaults)

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', {
      email: defaults.email,
      name: '',
      phone: defaults.phone,
    })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: '', name: '', phone: defaults.phone })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: '', name: '', phone: '' })
  })

  it('should fire onChange when controlled', async () => {
    const state = {}
    const changeHandler = jest.fn((props) => Object.assign(state, props))

    const { user } = renderWithUserEvents(
      <ContactInfoSelect defaults={defaults} name="controlled" show={state} onChange={changeHandler} />
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const nameInput = screen.getByRole('checkbox', { name: 'contact.name' })
    const emailInput = screen.getByRole('checkbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('checkbox', { name: 'contact.phone' })

    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()

    await user.click(nameInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: '', name: defaults.name, phone: '' })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', {
      email: defaults.email,
      name: defaults.name,
      phone: '',
    })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', defaults)

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', {
      email: defaults.email,
      name: '',
      phone: defaults.phone,
    })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: '', name: '', phone: defaults.phone })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: '', name: '', phone: '' })
  })
})

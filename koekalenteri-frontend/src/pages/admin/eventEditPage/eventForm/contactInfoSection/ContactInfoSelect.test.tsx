import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ContactInfoSelect from './ContactInfoSelect'

describe('PersonContactInfo', () => {

  it('should render', () => {
    const changeHandler = jest.fn()
    const { container } = render(<ContactInfoSelect name="official" onChange={changeHandler} />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange when uncontrolled', async () => {
    const user = userEvent.setup()
    const changeHandler = jest.fn()

    render(<ContactInfoSelect name="uncontrolled" onChange={changeHandler} />)

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const nameInput = screen.getByRole('checkbox', {name: 'contact.name'})
    const emailInput = screen.getByRole('checkbox', {name: 'contact.email'})
    const phoneInput = screen.getByRole('checkbox', {name: 'contact.phone'})

    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()

    await user.click(nameInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: false, name: true, phone: false })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: true, name: true, phone: false })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: true, name: true, phone: true })

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: true, name: false, phone: true })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: false, name: false, phone: true })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith('uncontrolled', { email: false, name: false, phone: false })
  })

  it('should fire onChange when controlled', async () => {
    const user = userEvent.setup()
    const state = {}
    const changeHandler = jest.fn((props) => Object.assign(state, props))

    render(<ContactInfoSelect name="controlled" show={state} onChange={changeHandler} />)

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const nameInput = screen.getByRole('checkbox', {name: 'contact.name'})
    const emailInput = screen.getByRole('checkbox', {name: 'contact.email'})
    const phoneInput = screen.getByRole('checkbox', {name: 'contact.phone'})

    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()

    await user.click(nameInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: false, name: true, phone: false })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: true, name: true, phone: false })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: true, name: true, phone: true })

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: true, name: false, phone: true })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: false, name: false, phone: true })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith('controlled', { email: false, name: false, phone: false })
  })
})

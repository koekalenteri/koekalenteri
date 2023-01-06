import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PersonContactInfo from './PersonContactInfo'

describe('PersonContactInfo', () => {

  it('should render', () => {
    const changeHandler = jest.fn()
    const { container } = render(<PersonContactInfo contact="official" onChange={changeHandler} />)
    expect(container).toMatchSnapshot()
  })

  it.each([
    { contact: 'official' as const },
    { contact: 'secretary' as const },
  ])(`should fire onChange when uncontrolled and contact is $contact`, async ({ contact }) => {
    const user = userEvent.setup()
    const changeHandler = jest.fn()

    render(<PersonContactInfo contact={contact} onChange={changeHandler} />)

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
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: true, phone: false } })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: true, phone: false } })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: true, phone: true } })

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: false, phone: true } })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: false, phone: true } })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: false, phone: false } })
  })

  it.each([
    { contact: 'official' as const },
    { contact: 'secretary' as const },
  ])(`should fire onChange when controlled and contact is $contact`, async ({ contact }) => {
    const user = userEvent.setup()
    const state = {}
    const changeHandler = jest.fn((props) => Object.assign(state, props))

    render(<PersonContactInfo contact={contact} show={state} onChange={changeHandler} />)

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
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: true, phone: false } })

    await user.click(emailInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: true, phone: false } })

    await user.click(phoneInput)
    expect(nameInput).toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: true, phone: true } })

    await user.click(nameInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: true, name: false, phone: true } })

    await user.click(emailInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(5)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: false, phone: true } })

    await user.click(phoneInput)
    expect(nameInput).not.toBeChecked()
    expect(emailInput).not.toBeChecked()
    expect(phoneInput).not.toBeChecked()
    expect(changeHandler).toHaveBeenCalledTimes(6)
    expect(changeHandler).toHaveBeenLastCalledWith({ [contact]: { email: false, name: false, phone: false } })
  })

})

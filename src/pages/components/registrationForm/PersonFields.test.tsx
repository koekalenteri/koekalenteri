import { screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import { PersonFields } from './PersonFields'

describe('PersonFields', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders and updates all contact fields', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <PersonFields
        idPrefix="person"
        onChange={onChange}
        person={{
          email: 'person@example.com',
          location: 'Helsinki',
          name: 'Test Person',
          phone: '+3584012345',
        }}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    const nameInput = screen.getByRole('textbox', { name: 'contact.name' })
    const locationInput = screen.getByRole('textbox', { name: 'contact.city' })
    const emailInput = screen.getByRole('textbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('textbox', { name: 'contact.phone' })

    expect(nameInput).toHaveAttribute('id', 'person_name')
    expect(nameInput).toHaveAttribute('autocomplete', 'name')
    expect(locationInput).toHaveAttribute('id', 'person_city')
    expect(locationInput).toHaveAttribute('autocomplete', 'address-level2')
    expect(emailInput).toHaveAttribute('id', 'person_email')
    expect(emailInput).toHaveAttribute('autocomplete', 'email')
    expect(phoneInput).toHaveAttribute('id', 'person_phone')
    expect(phoneInput).toHaveAttribute('autocomplete', 'tel')

    await user.clear(nameInput)
    await user.clear(locationInput)
    await user.clear(emailInput)
    await user.clear(phoneInput)
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ email: '', location: '', name: '', phone: '' })
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.type(emailInput, ' person@example.com \n')
    await user.type(phoneInput, '40123456')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      email: 'person@example.com',
      location: '',
      name: '',
      phone: '+358 40 123456',
    })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('can omit the location field', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <PersonFields
        contactFields={{ email: 'required', phone: 'required' }}
        idPrefix="payer"
        onChange={onChange}
        person={{ email: '', name: '', phone: '' }}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(screen.queryByRole('textbox', { name: 'contact.city' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'contact.name' }), 'Test Payer')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({ email: '', name: 'Test Payer', phone: '' })
  })

  it('asks for the name alone when no contact details are wanted', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <PersonFields contactFields={{}} idPrefix="owner_1" onChange={onChange} person={{ name: '' }} />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(screen.queryByRole('textbox', { name: 'contact.city' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'contact.email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'contact.phone' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'contact.name' }), 'Co Owner')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({ name: 'Co Owner' })
  })

  it('does not flag an empty optional contact field', () => {
    renderWithUserEvents(
      <PersonFields
        contactFields={{ email: 'optional', location: 'optional', phone: 'optional' }}
        idPrefix="owner_2"
        onChange={vi.fn()}
        person={{ email: '', location: '', name: 'Co Owner', phone: '' }}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(screen.getByRole('textbox', { name: 'contact.email' })).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'contact.city' })).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'contact.phone' })).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('flags a contact detail that was given but does not validate, required or not', () => {
    // The section header only says that some phone number is wrong; without this the entrant has to
    // guess which of several owners it means.
    renderWithUserEvents(
      <PersonFields
        contactFields={{ email: 'optional', location: 'optional', phone: 'optional' }}
        idPrefix="owner_2"
        onChange={vi.fn()}
        person={{ email: 'not-an-address', location: '', name: 'Co Owner', phone: '+35841234' }}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(screen.getByRole('textbox', { name: 'contact.email' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'contact.phone' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'contact.city' })).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('reads a bare calling code as an empty phone number', () => {
    renderWithUserEvents(
      <PersonFields
        contactFields={{ email: 'optional', phone: 'optional' }}
        idPrefix="owner_2"
        onChange={vi.fn()}
        person={{ email: '', name: 'Co Owner', phone: '+358' }}
      />,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(screen.getByRole('textbox', { name: 'contact.phone' })).not.toHaveAttribute('aria-invalid', 'true')
  })
})

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
        idPrefix="payer"
        includeLocation={false}
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
})

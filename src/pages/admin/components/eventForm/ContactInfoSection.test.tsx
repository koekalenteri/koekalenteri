import type { ContactInfo, User } from '../../../../types'
import { render, screen } from '@testing-library/react'
import ContactInfoSection from './ContactInfoSection'

describe('ContactInfoSection', () => {
  const variants: ContactInfo[] = []

  for (let i = 0; i < 64; i++) {
    variants.push({
      official: {
        email: (i & 0b000010) !== 0 ? 'official@example.com' : '',
        name: (i & 0b000001) !== 0 ? 'Test Official' : '',
        phone: (i & 0b000100) !== 0 ? '+3584012345' : '',
      },
      secretary: {
        email: (i & 0b010000) !== 0 ? 'secretary@example.com' : '',
        name: (i & 0b001000) !== 0 ? 'Test Secretary' : '',
        phone: (i & 0b100000) !== 0 ? '+3584054321' : '',
      },
    })
  }

  const official: User = {
    email: 'official@example.com',
    id: '0',
    location: "official's place",
    name: 'Test Official',
    officer: ['Type-A', 'Type-B', 'Type-C'],
    phone: '+3584012345',
  }

  const secretary: User = {
    email: 'secretary@example.com',
    id: '0',
    location: "secretary's place",
    name: 'Test Secretary',
    phone: '+3584054321',
  }

  it.each(variants)('checks exactly the fields %j has set', (contactInfo: ContactInfo) => {
    const changeHandler = vi.fn()
    render(
      <ContactInfoSection
        contactInfo={contactInfo}
        official={official}
        secretary={secretary}
        onChange={changeHandler}
      />
    )

    // DOM order matches ContactInfoSection's own layout: official's name/email/phone, then
    // secretary's -- the same order the 64 variants above pack into their bits.
    const checked = screen.getAllByRole('checkbox').map((checkbox) => (checkbox as HTMLInputElement).checked)
    expect(checked).toEqual([
      contactInfo.official?.name !== '',
      contactInfo.official?.email !== '',
      contactInfo.official?.phone !== '',
      contactInfo.secretary?.name !== '',
      contactInfo.secretary?.email !== '',
      contactInfo.secretary?.phone !== '',
    ])
  })
})

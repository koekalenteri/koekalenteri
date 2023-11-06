import type { ContactInfo, User } from '../../../../types'

import { render } from '@testing-library/react'

import ContactInfoSection from './ContactInfoSection'

describe('ContactInfoSection', () => {
  const variants: ContactInfo[] = []

  for (let i = 0; i < 64; i++) {
    variants.push({
      official: {
        name: (i & 0b000001) !== 0 ? 'Test Official' : '',
        email: (i & 0b000010) !== 0 ? 'official@example.com' : '',
        phone: (i & 0b000100) !== 0 ? '+3584012345' : '',
      },
      secretary: {
        name: (i & 0b001000) !== 0 ? 'Test Secretary' : '',
        email: (i & 0b010000) !== 0 ? 'secretary@example.com' : '',
        phone: (i & 0b100000) !== 0 ? '+3584054321' : '',
      },
    })
  }

  const official: User = {
    id: '0',
    name: 'Test Official',
    email: 'official@example.com',
    phone: '+3584012345',
    location: "official's place",
    officer: ['Type-A', 'Type-B', 'Type-C'],
  }

  const secretary: User = {
    id: '0',
    name: 'Test Secretary',
    email: 'secretary@example.com',
    phone: '+3584054321',
    location: "secretary's place",
  }

  it.each(variants)('renders with %j', (contactInfo: ContactInfo) => {
    const changeHandler = jest.fn()
    const { container } = render(
      <ContactInfoSection
        contactInfo={contactInfo}
        official={official}
        secretary={secretary}
        onChange={changeHandler}
      />
    )
    expect(container).toMatchSnapshot()
  })
})

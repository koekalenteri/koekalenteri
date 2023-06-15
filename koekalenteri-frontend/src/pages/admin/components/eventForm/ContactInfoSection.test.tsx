import { render } from '@testing-library/react'
import { ContactInfo, Official, Secretary } from 'koekalenteri-shared/model'

import ContactInfoSection from './ContactInfoSection'

describe('ContactInfoSection', () => {
  const variants: ContactInfo[] = []

  for (let i = 0; i < 64; i++) {
    variants.push({
      official: {
        name: (i & 0b000001) !== 0,
        email: (i & 0b000010) !== 0,
        phone: (i & 0b000100) !== 0,
      },
      secretary: {
        name: (i & 0b001000) !== 0,
        email: (i & 0b010000) !== 0,
        phone: (i & 0b100000) !== 0,
      },
    })
  }

  const official: Official = {
    id: 0,
    name: 'Test Official',
    email: 'official@example.com',
    phone: '0700-official',
    location: "official's place",
    district: "official's district",
    eventTypes: ['Type-A', 'Type-B', 'Type-C'],
  }

  const secretary: Secretary = {
    id: 0,
    name: 'Test Secretary',
    email: 'secretary@example.com',
    phone: '0700-secretary',
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

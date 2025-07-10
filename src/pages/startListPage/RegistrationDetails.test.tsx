import type { PublicRegistration } from '../../types/Registration'

import { render, screen } from '@testing-library/react'

import { RegistrationDetails } from './RegistrationDetails'

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, _options?: any) => {
      if (key.includes('breedAbbr')) {
        return 'LAB/U'
      }
      if (key === 'dateFormat.date') {
        return '1.1.2020'
      }
      return key
    },
  }),
}))

describe('RegistrationDetails', () => {
  const mockRegistration: PublicRegistration = {
    class: 'AVO',
    cancelled: false,
    dog: {
      name: 'Test Dog',
      titles: 'CH',
      regNo: 'REG123',
      breedCode: '111',
      gender: 'M',
      dob: new Date('2020-01-01'),
      sire: {
        name: 'Sire Dog',
        titles: 'CH',
      },
      dam: {
        name: 'Dam Dog',
        titles: 'CH',
      },
      results: [],
    },
    group: {
      number: 123,
      key: 'group-123',
      date: new Date('2023-01-01'),
      time: 'ap',
    },
    owner: 'Test Owner',
    handler: 'Test Handler',
    breeder: 'Test Breeder',
    ownerHandles: false,
  }

  it('renders registration details correctly', () => {
    render(
      <table>
        <tbody>
          <RegistrationDetails registration={mockRegistration} index={0} />
        </tbody>
      </table>
    )

    // Check that dog information is rendered
    expect(screen.getByText('123.')).toBeInTheDocument()
    expect(screen.getByText('111.M')).toBeInTheDocument() // Updated to match actual text
    expect(screen.getByText('CH')).toBeInTheDocument()
    expect(screen.getByText('Test Dog')).toBeInTheDocument()
    expect(screen.getByText('REG123')).toBeInTheDocument()
    expect(screen.getByText('s. 1.1.2020')).toBeInTheDocument()

    // Check that sire and dam information is rendered
    expect(screen.getByText('(i. CH Sire Dog, e. CH Dam Dog)')).toBeInTheDocument()

    // Check that owner, handler, and breeder information is rendered
    expect(screen.getByText('om. Test Owner, ohj. Test Handler')).toBeInTheDocument()
    expect(screen.getByText('kasv. Test Breeder')).toBeInTheDocument()
  })

  it('renders owner-handler correctly when owner handles', () => {
    const regWithOwnerHandles = {
      ...mockRegistration,
      ownerHandles: true,
    }

    render(
      <table>
        <tbody>
          <RegistrationDetails registration={regWithOwnerHandles} index={0} />
        </tbody>
      </table>
    )

    // Check that owner-handler information is rendered correctly
    expect(screen.getByText('om. & ohj. Test Owner')).toBeInTheDocument()
  })

  it('applies top-border class when index > 0', () => {
    const { container } = render(
      <table>
        <tbody>
          <RegistrationDetails registration={mockRegistration} index={1} />
        </tbody>
      </table>
    )

    // Check that the top-border class is applied
    const row = container.querySelector('.top-border')
    expect(row).toBeInTheDocument()
  })
})

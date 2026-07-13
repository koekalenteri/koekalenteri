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
    breeder: 'Test Breeder',
    cancelled: false,
    class: 'AVO',
    dog: {
      breedCode: '111',
      dam: {
        name: 'Dam Dog',
        titles: 'CH',
      },
      dob: new Date('2020-01-01'),
      gender: 'M',
      name: 'Test Dog',
      regNo: 'REG123',
      results: [],
      sire: {
        name: 'Sire Dog',
        titles: 'CH',
      },
      titles: 'CH',
    },
    group: {
      date: new Date('2023-01-01'),
      key: 'group-123',
      number: 123,
      time: 'ap',
    },
    handler: 'Test Handler',
    owner: 'Test Owner',
    ownerHandles: false,
  }

  it('renders registration details correctly', () => {
    const { container } = render(
      <table>
        <tbody>
          <RegistrationDetails registration={mockRegistration} index={0} />
        </tbody>
      </table>
    )
    const row = container.querySelector('tr')

    // Check that dog information is rendered
    expect(row).toHaveTextContent('123.')
    expect(row).toHaveTextContent('111.M')
    expect(row).toHaveTextContent('CH')
    expect(row).toHaveTextContent('Test Dog')
    expect(row).toHaveTextContent('REG123')
    expect(row).toHaveTextContent('s. 1.1.2020')

    // Check that sire and dam information is rendered
    expect(screen.getByText('(i. CH Sire Dog, e. CH Dam Dog)')).toBeInTheDocument()

    // Check that owner, handler, and breeder information is rendered
    expect(screen.getByText('om. Test Owner, ohj. Test Handler, kasv. Test Breeder')).toBeInTheDocument()
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
    expect(screen.getByText('om. & ohj. Test Owner, kasv. Test Breeder')).toBeInTheDocument()
  })

  it('does not add extra spaces when parent titles are missing', () => {
    const registrationWithoutParentTitles = {
      ...mockRegistration,
      dog: {
        ...mockRegistration.dog,
        dam: { name: 'Dam Dog', titles: '  ' },
        sire: { name: 'Sire Dog', titles: ' ' },
      },
    }

    render(
      <table>
        <tbody>
          <RegistrationDetails registration={registrationWithoutParentTitles} index={0} />
        </tbody>
      </table>
    )

    expect(screen.getByText('(i. Sire Dog, e. Dam Dog)')).toBeInTheDocument()
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

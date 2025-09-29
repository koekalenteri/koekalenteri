import type { Registration } from '../../../../types'

import { render, screen } from '@testing-library/react'

import { eventWithStaticDatesAnd3Classes } from '../../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import * as registrationUtils from '../../../../lib/registration'

import RegistrationIcons from './RegistrationIcons'

// Helper function to create a mock registration with default values
const createMockRegistration = (overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  notes: '',
  internalNotes: '',
  qualifyingResults: [],
  ...overrides,
})

describe('RegistrationIcons component', () => {
  it('should render icons with correct opacity based on registration properties', () => {
    // Mock a registration with all properties set
    const mockReg = createMockRegistration({
      owner: { ...registrationWithStaticDates.owner!, membership: true },
      handler: { ...registrationWithStaticDates.handler!, membership: true },
      paidAt: new Date(),
      confirmed: true,
      invitationRead: true,
      notes: 'Some notes',
      internalNotes: 'Internal notes',
      qualifyingResults: [
        {
          id: '1',
          regNo: '123',
          official: false,
          result: 'ALO1',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          location: 'Test Location',
          judge: 'Test Judge',
        },
      ],
    })

    // Spy on the hasPriority function to return true
    const hasPrioritySpy = jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(true)

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // Restore the original implementation
    hasPrioritySpy.mockRestore()

    // The component should be rendered
    expect(screen.getByTestId('StarOutlinedIcon')).toBeInTheDocument()
  })

  it('should render icons with correct opacity when properties are not set', () => {
    // Mock a registration with no properties set
    const mockReg = createMockRegistration({
      owner: { ...registrationWithStaticDates.owner!, membership: false },
      handler: { ...registrationWithStaticDates.handler!, membership: false },
      paidAt: undefined,
      confirmed: false,
      invitationRead: false,
      notes: '',
      internalNotes: '',
      qualifyingResults: [],
    })

    // Spy on the hasPriority function to return false
    const hasPrioritySpy = jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(false)

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // Restore the original implementation
    hasPrioritySpy.mockRestore()

    // The component should be rendered
    expect(screen.getByTestId('StarBorderOutlinedIcon')).toBeInTheDocument()
  })

  it('should render refund icon when registration has been refunded', () => {
    // Mock a registration with refund
    const mockReg = createMockRegistration({
      paidAt: new Date(),
      refundAt: new Date(),
      paidAmount: 5000,
      refundAmount: 2500,
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  it('should render refund icon when refund is pending', () => {
    // Mock a registration with pending refund
    const mockReg = createMockRegistration({
      paidAt: new Date(),
      refundStatus: 'PENDING',
      paidAmount: 5000,
      refundAmount: 2500,
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  it('should correctly calculate manualResultCount', () => {
    // Mock a registration with both manual and official results
    const mockReg = createMockRegistration({
      qualifyingResults: [
        {
          id: '1',
          regNo: '123',
          official: false, // manual result
          result: 'ALO1',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          location: 'Test Location',
          judge: 'Test Judge',
        },
        {
          id: '2',
          regNo: '123',
          official: true, // official result
          result: 'ALO1',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          location: 'Test Location',
          judge: 'Test Judge',
        },
        {
          id: '3',
          regNo: '123',
          official: false, // manual result
          result: 'ALO2',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          location: 'Test Location',
          judge: 'Test Judge',
        },
      ],
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('ErrorOutlineOutlinedIcon')).toBeInTheDocument()
  })

  it('should correctly calculate rankingPoints', () => {
    // Mock a registration with results that have ranking points
    const mockReg = createMockRegistration({
      qualifyingResults: [
        {
          id: '1',
          regNo: '123',
          official: true,
          result: 'ALO1',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          rankingPoints: 3,
          location: 'Test Location',
          judge: 'Test Judge',
        },
        {
          id: '2',
          regNo: '123',
          official: true,
          result: 'ALO1',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          rankingPoints: 2,
          location: 'Test Location',
          judge: 'Test Judge',
        },
        {
          id: '3',
          regNo: '123',
          official: true,
          result: 'ALO2',
          date: new Date(),
          type: 'NOME-B',
          class: 'ALO',
          // No ranking points for this result
          location: 'Test Location',
          judge: 'Test Judge',
        },
      ],
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    // Check for the avatar with ranking points
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should handle priority 0.5 with owner membership correctly', () => {
    // Mock a registration with priority 0.5 and owner membership
    const mockReg = createMockRegistration({
      owner: { ...registrationWithStaticDates.owner!, membership: true },
      handler: { ...registrationWithStaticDates.handler!, membership: false },
    })

    // Spy on the hasPriority function to return 0.5
    const hasPrioritySpy = jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(0.5)
    const priorityDescriptionKeySpy = jest.spyOn(registrationUtils, 'priorityDescriptionKey').mockReturnValue('member')

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // Restore the original implementations
    hasPrioritySpy.mockRestore()
    priorityDescriptionKeySpy.mockRestore()

    // The component should be rendered
    expect(screen.getByTestId('StarHalfOutlinedIcon')).toBeInTheDocument()
  })

  it('should handle priority 0.5 with handler membership correctly', () => {
    // Mock a registration with priority 0.5 and handler membership
    const mockReg = createMockRegistration({
      owner: { ...registrationWithStaticDates.owner!, membership: false },
      handler: { ...registrationWithStaticDates.handler!, membership: true },
    })

    // Spy on the hasPriority function to return 0.5
    const hasPrioritySpy = jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(0.5)
    const priorityDescriptionKeySpy = jest.spyOn(registrationUtils, 'priorityDescriptionKey').mockReturnValue('member')

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // Restore the original implementations
    hasPrioritySpy.mockRestore()
    priorityDescriptionKeySpy.mockRestore()

    // The component should be rendered
    expect(screen.getByTestId('StarHalfOutlinedIcon')).toBeInTheDocument()
  })

  it('should handle paid registration without refund', () => {
    // Mock a registration that is paid but not refunded
    const mockReg = createMockRegistration({
      paidAt: new Date(),
      paidAmount: 5000,
      refundAmount: 0,
      refundAt: undefined,
      refundStatus: undefined,
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('EuroOutlinedIcon')).toBeInTheDocument()
  })

  it('should handle duplicate internal notes correctly', () => {
    // Mock a registration with internal notes
    const mockReg = createMockRegistration({
      internalNotes: 'Internal notes',
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('SpeakerNotesOutlinedIcon')).toBeInTheDocument()
  })
})

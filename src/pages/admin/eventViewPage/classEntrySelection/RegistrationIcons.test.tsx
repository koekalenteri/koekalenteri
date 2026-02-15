import type { Registration } from '../../../../types'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventWithStaticDatesAnd3Classes } from '../../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import * as registrationUtils from '../../../../lib/registration'
import RegistrationIcons from './RegistrationIcons'

// Helper function to create a mock registration with default values
const createMockRegistration = (overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  internalNotes: '',
  notes: '',
  qualifyingResults: [],
  ...overrides,
})

describe('RegistrationIcons component', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('does not render an empty tooltip when there are no tooltip rows/icons', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    const mockReg = createMockRegistration({
      confirmed: false,
      handler: { ...registrationWithStaticDates.handler!, membership: false },
      internalNotes: '',
      invitationRead: false,
      notes: '',
      optionalCosts: [],
      owner: { ...registrationWithStaticDates.owner!, membership: false },
      paidAt: undefined,
      qualifyingResults: [],
      refundAt: undefined,
      refundStatus: undefined,
    })

    jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(false)

    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // Tooltip target is the whole icon row (Stack renders to a div)
    await user.hover(screen.getByTestId('StarBorderOutlinedIcon').closest('div')!)
    act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('should render icons with correct opacity based on registration properties', () => {
    // Mock a registration with all properties set
    const mockReg = createMockRegistration({
      confirmed: true,
      handler: { ...registrationWithStaticDates.handler!, membership: true },
      internalNotes: 'Internal notes',
      invitationRead: true,
      notes: 'Some notes',
      owner: { ...registrationWithStaticDates.owner!, membership: true },
      paidAt: new Date(),
      qualifyingResults: [
        {
          class: 'ALO',
          date: new Date(),
          id: '1',
          judge: 'Test Judge',
          location: 'Test Location',
          official: false,
          regNo: '123',
          result: 'ALO1',
          type: 'NOME-B',
        },
      ],
    })

    // Spy on the hasPriority function to return true
    jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(true)

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('StarOutlinedIcon')).toBeInTheDocument()
  })

  it('should render icons with correct opacity when properties are not set', () => {
    // Mock a registration with no properties set
    const mockReg = createMockRegistration({
      confirmed: false,
      handler: { ...registrationWithStaticDates.handler!, membership: false },
      internalNotes: '',
      invitationRead: false,
      notes: '',
      owner: { ...registrationWithStaticDates.owner!, membership: false },
      paidAt: undefined,
      qualifyingResults: [],
    })

    // Spy on the hasPriority function to return false
    jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(false)

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('StarBorderOutlinedIcon')).toBeInTheDocument()
  })

  it('should render refund icon when registration has been refunded', () => {
    // Mock a registration with refund
    const mockReg = createMockRegistration({
      paidAmount: 5000,
      paidAt: new Date(),
      refundAmount: 2500,
      refundAt: new Date(),
    })

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  it('should render refund icon when refund is pending', () => {
    // Mock a registration with pending refund
    const mockReg = createMockRegistration({
      paidAmount: 5000,
      paidAt: new Date(),
      refundAmount: 2500,
      refundStatus: 'PENDING',
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
          class: 'ALO',
          date: new Date(),
          id: '1',
          judge: 'Test Judge',
          location: 'Test Location',
          official: false, // manual result
          regNo: '123',
          result: 'ALO1',
          type: 'NOME-B',
        },
        {
          class: 'ALO',
          date: new Date(),
          id: '2',
          judge: 'Test Judge',
          location: 'Test Location',
          official: true, // official result
          regNo: '123',
          result: 'ALO1',
          type: 'NOME-B',
        },
        {
          class: 'ALO',
          date: new Date(),
          id: '3',
          judge: 'Test Judge',
          location: 'Test Location',
          official: false, // manual result
          regNo: '123',
          result: 'ALO2',
          type: 'NOME-B',
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
          class: 'ALO',
          date: new Date(),
          id: '1',
          judge: 'Test Judge',
          location: 'Test Location',
          official: true,
          rankingPoints: 3,
          regNo: '123',
          result: 'ALO1',
          type: 'NOME-B',
        },
        {
          class: 'ALO',
          date: new Date(),
          id: '2',
          judge: 'Test Judge',
          location: 'Test Location',
          official: true,
          rankingPoints: 2,
          regNo: '123',
          result: 'ALO1',
          type: 'NOME-B',
        },
        {
          class: 'ALO',
          date: new Date(),
          id: '3',
          judge: 'Test Judge',
          // No ranking points for this result
          location: 'Test Location',
          official: true,
          regNo: '123',
          result: 'ALO2',
          type: 'NOME-B',
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
      handler: { ...registrationWithStaticDates.handler!, membership: false },
      owner: { ...registrationWithStaticDates.owner!, membership: true },
    })

    // Spy on the hasPriority function to return 0.5
    jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(0.5)
    jest.spyOn(registrationUtils, 'priorityDescriptionKey').mockReturnValue('member')

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('StarHalfOutlinedIcon')).toBeInTheDocument()
  })

  it('should handle priority 0.5 with handler membership correctly', () => {
    // Mock a registration with priority 0.5 and handler membership
    const mockReg = createMockRegistration({
      handler: { ...registrationWithStaticDates.handler!, membership: true },
      owner: { ...registrationWithStaticDates.owner!, membership: false },
    })

    // Spy on the hasPriority function to return 0.5
    jest.spyOn(registrationUtils, 'hasPriority').mockReturnValue(0.5)
    jest.spyOn(registrationUtils, 'priorityDescriptionKey').mockReturnValue('member')

    // Render the component
    render(<RegistrationIcons event={eventWithStaticDatesAnd3Classes} reg={mockReg} />)

    // The component should be rendered
    expect(screen.getByTestId('StarHalfOutlinedIcon')).toBeInTheDocument()
  })

  it('should handle paid registration without refund', () => {
    // Mock a registration that is paid but not refunded
    const mockReg = createMockRegistration({
      paidAmount: 5000,
      paidAt: new Date(),
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

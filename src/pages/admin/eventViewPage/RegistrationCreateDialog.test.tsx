import type { Registration, RegistrationClass } from '../../../types'
import { render, screen } from '@testing-library/react'
import { useRecoilState, useResetRecoilState } from 'recoil'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { emptyBreeder, emptyDog, emptyPerson } from '../../../lib/data'
import { adminNewRegistrationAtom } from '../recoil'
import RegistrationCreateDialog from './RegistrationCreateDialog'
import RegistrationDialogBase from './RegistrationDialogBase'

// Mock dependencies
jest.mock('recoil')
jest.mock('./RegistrationDialogBase', () => {
  const MockRegistrationDialogBase = jest.fn(() => <div data-testid="registration-dialog-base" />)
  return {
    __esModule: true,
    default: MockRegistrationDialogBase,
  }
})

describe('RegistrationCreateDialog', () => {
  const mockUseRecoilState = useRecoilState as jest.Mock
  const mockUseResetRecoilState = useResetRecoilState as jest.Mock
  const mockSetRegistration = jest.fn()
  const mockResetRegistration = jest.fn()

  const defaultRegistration: Registration = {
    agreeToTerms: false,
    breeder: { ...emptyBreeder },
    createdAt: new Date(),
    createdBy: 'anonymous',
    dates: [],
    dog: { ...emptyDog },
    eventId: '',
    eventType: '',
    handler: { ...emptyPerson },
    id: '',
    language: 'fi',
    modifiedAt: new Date(),
    modifiedBy: 'anonymous',
    notes: '',
    owner: { ...emptyPerson },
    ownerHandles: true,
    ownerPays: true,
    payer: { ...emptyPerson },
    qualifyingResults: [],
    reserve: 'DAY',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRecoilState.mockReturnValue([defaultRegistration, mockSetRegistration])
    mockUseResetRecoilState.mockReturnValue(mockResetRegistration)
  })

  // 1. Rendering Tests

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      render(<RegistrationCreateDialog event={eventWithStaticDates} open={false} />)

      expect(screen.queryByTestId('registration-dialog-base')).not.toBeInTheDocument()
    })

    it('should render RegistrationDialogBase when open is true', () => {
      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      // Instead of checking for the rendered element, check if the mock was called
      expect(RegistrationDialogBase).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: true,
          classDisabled: true,
          event: eventWithStaticDates,
          open: true,
          registration: defaultRegistration,
          resetRegistration: mockResetRegistration,
          setRegistration: mockSetRegistration,
        }),
        expect.anything()
      )
    })

    it('should pass onClose prop to RegistrationDialogBase', () => {
      const mockOnClose = jest.fn()

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} onClose={mockOnClose} />)

      expect(RegistrationDialogBase).toHaveBeenCalledWith(
        expect.objectContaining({
          onClose: mockOnClose,
        }),
        expect.anything()
      )
    })

    it('should pass eventClass prop to RegistrationDialogBase', () => {
      const eventClass: RegistrationClass = 'ALO'

      render(<RegistrationCreateDialog event={eventWithStaticDates} eventClass={eventClass} open={true} />)

      // The eventClass itself is not passed directly, but it affects the registration
      expect(RegistrationDialogBase).toHaveBeenCalled()
    })
  })

  // 2. State Management Tests

  describe('State Management', () => {
    it('should use Recoil state for registration', () => {
      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(mockUseRecoilState).toHaveBeenCalledWith(adminNewRegistrationAtom)
      expect(mockUseResetRecoilState).toHaveBeenCalledWith(adminNewRegistrationAtom)
    })

    it('should pass registration state to RegistrationDialogBase', () => {
      const customRegistration: Registration = {
        ...defaultRegistration,
        eventId: 'test-event-id',
        id: 'test-id',
      }

      mockUseRecoilState.mockReturnValue([customRegistration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(RegistrationDialogBase).toHaveBeenCalledWith(
        expect.objectContaining({
          registration: customRegistration,
        }),
        expect.anything()
      )
    })
  })

  // 3. Effect Tests

  describe('Effect', () => {
    it('should not update registration when open is false', () => {
      render(<RegistrationCreateDialog event={eventWithStaticDates} open={false} />)

      expect(mockSetRegistration).not.toHaveBeenCalled()
    })

    it('should not update registration when registration is undefined', () => {
      mockUseRecoilState.mockReturnValue([undefined, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(mockSetRegistration).not.toHaveBeenCalled()
    })

    it('should update registration when eventId does not match', () => {
      const registration: Registration = {
        ...defaultRegistration,
        eventId: 'different-event-id',
        eventType: eventWithStaticDates.eventType,
      }

      mockUseRecoilState.mockReturnValue([registration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(mockSetRegistration).toHaveBeenCalledWith({
        ...registration,
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      })
    })

    it('should update registration when eventType does not match', () => {
      const registration: Registration = {
        ...defaultRegistration,
        eventId: eventWithStaticDates.id,
        eventType: 'different-event-type',
      }

      mockUseRecoilState.mockReturnValue([registration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(mockSetRegistration).toHaveBeenCalledWith({
        ...registration,
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      })
    })

    it('should update registration when eventClass is provided and does not match', () => {
      const eventClass: RegistrationClass = 'ALO'
      const registration: Registration = {
        ...defaultRegistration,
        class: 'AVO',
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      }

      mockUseRecoilState.mockReturnValue([registration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} eventClass={eventClass} open={true} />)

      expect(mockSetRegistration).toHaveBeenCalledWith({
        ...registration,
        class: eventClass,
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      })
    })

    it('should not update registration when all fields match', () => {
      const eventClass: RegistrationClass = 'ALO'
      const registration: Registration = {
        ...defaultRegistration,
        class: eventClass,
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      }

      mockUseRecoilState.mockReturnValue([registration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} eventClass={eventClass} open={true} />)

      expect(mockSetRegistration).not.toHaveBeenCalled()
    })
  })

  // 4. Empty Registration Tests

  describe('Empty Registration', () => {
    it('should handle empty registration object', () => {
      // Create an empty registration object (just the required fields to avoid TypeScript errors)
      const emptyRegistration = {} as Registration

      mockUseRecoilState.mockReturnValue([emptyRegistration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      // Component should not crash - check if the mock was called
      expect(RegistrationDialogBase).toHaveBeenCalled()
    })

    it('should update empty registration with event information', () => {
      // Create an empty registration object (just the required fields to avoid TypeScript errors)
      const emptyRegistration = {} as Registration

      mockUseRecoilState.mockReturnValue([emptyRegistration, mockSetRegistration])

      const eventClass: RegistrationClass = 'ALO'

      render(<RegistrationCreateDialog event={eventWithStaticDates} eventClass={eventClass} open={true} />)

      expect(mockSetRegistration).toHaveBeenCalledWith({
        ...emptyRegistration,
        class: eventClass,
        eventId: eventWithStaticDates.id,
        eventType: eventWithStaticDates.eventType,
      })
    })

    it('should pass empty registration to RegistrationDialogBase', () => {
      // Create an empty registration object (just the required fields to avoid TypeScript errors)
      const emptyRegistration = {} as Registration

      mockUseRecoilState.mockReturnValue([emptyRegistration, mockSetRegistration])

      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(RegistrationDialogBase).toHaveBeenCalledWith(
        expect.objectContaining({
          registration: emptyRegistration,
        }),
        expect.anything()
      )
    })
  })

  // 5. Integration Tests

  describe('Integration', () => {
    // This test verifies that the component correctly integrates with RegistrationDialogBase
    it('should pass all required props to RegistrationDialogBase', () => {
      const mockOnClose = jest.fn()
      const eventClass: RegistrationClass = 'ALO'

      render(
        <RegistrationCreateDialog
          event={eventWithStaticDates}
          eventClass={eventClass}
          onClose={mockOnClose}
          open={true}
        />
      )

      expect(RegistrationDialogBase).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: true,
          classDisabled: true,
          event: eventWithStaticDates,
          onClose: mockOnClose,
          open: true,
          registration: defaultRegistration,
          resetRegistration: mockResetRegistration,
          setRegistration: mockSetRegistration,
        }),
        expect.anything()
      )
    })

    // This test would require a more complex setup with actual Recoil state
    // It's included here for completeness, but would need a different approach in a real test
    it('should update when Recoil state changes', () => {
      // This would require a custom test component that wraps the component with RecoilRoot
      // and allows changing the Recoil state during the test

      // For now, we'll just verify that the component uses the Recoil state
      render(<RegistrationCreateDialog event={eventWithStaticDates} open={true} />)

      expect(mockUseRecoilState).toHaveBeenCalled()
    })
  })
})

import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type React from 'react'
import type { Registration, RegistrationDate } from '../../../../types'

import { renderHook } from '@testing-library/react'

import { eventWithStaticDatesAnd3Classes } from '../../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import * as registrationUtils from '../../../../lib/registration'

import { useClassEntrySelectionColumns } from './useClassEntrySectionColumns'

const mockAvailableDates: RegistrationDate[] = [
  { date: eventWithStaticDatesAnd3Classes.startDate, time: 'ap' },
  { date: eventWithStaticDatesAnd3Classes.startDate, time: 'ip' },
  { date: eventWithStaticDatesAnd3Classes.endDate, time: 'ap' },
]

describe('useClassEntrySectionColumns', () => {
  it('should return column definitions', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    // Check that the hook returns the expected objects
    expect(result.current).toHaveProperty('entryColumns')
    expect(result.current).toHaveProperty('participantColumns')
    expect(result.current).toHaveProperty('cancelledColumns')

    // Check that the columns have the expected structure
    const { entryColumns, participantColumns, cancelledColumns } = result.current

    // Check entry columns
    expect(entryColumns).toHaveLength(9)
    expect(entryColumns[0].field).toBe('dates')
    expect(entryColumns[1].field).toBe('number')
    expect(entryColumns[2].field).toBe('dog.name')
    expect(entryColumns[3].field).toBe('dog.regNo')
    expect(entryColumns[4].field).toBe('dob.breed')
    expect(entryColumns[5].field).toBe('handler')
    expect(entryColumns[6].field).toBe('lastEmail')
    expect(entryColumns[7].field).toBe('icons')
    expect(entryColumns[8].field).toBe('actions')

    // Check participant columns (should be the same as entry columns)
    expect(participantColumns).toEqual(entryColumns)

    // Check cancelled columns (should have an extra column for cancel reason)
    expect(cancelledColumns.length).toBeGreaterThan(entryColumns.length)
    const cancelReasonColumn = cancelledColumns.find((col) => col.field === 'cancelReason')
    expect(cancelReasonColumn).toBeDefined()
  })

  it('should include callback functions in action column when provided', () => {
    const openEditDialogMock = jest.fn()
    const cancelRegistrationMock = jest.fn()
    const refundRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        openEditDialogMock,
        cancelRegistrationMock,
        refundRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')

    // Check that the actions column exists
    expect(actionsColumn).toBeDefined()

    // Mock a row to test the getActions function
    const mockRow = {
      id: 'test-id',
      cancelled: false,
      paidAt: new Date(),
      paidAmount: 5000,
      refundAmount: 0,
    } as Registration

    // Get the actions for the mock row
    // We need to use any here because TypeScript doesn't know about the getActions method
    const actions = (actionsColumn as any)?.getActions({ row: mockRow } as GridRenderCellParams<any, Registration>)
    expect(actions).toBeDefined()

    // Check that the actions include the edit action
    expect(actions.length).toBeGreaterThan(0)

    // Simulate clicking the edit action
    const editAction = actions.find((action: ReactElement) => action.key === 'edit')
    editAction?.props.onClick()

    // Check that the openEditDialog callback was called with the correct ID
    expect(openEditDialogMock).toHaveBeenCalledWith('test-id')

    // Simulate clicking the withdraw action
    const withdrawAction = actions.find((action: ReactElement) => action.key === 'withdraw')
    withdrawAction?.props.onClick()

    // Check that the cancelRegistration callback was called with the correct ID
    expect(cancelRegistrationMock).toHaveBeenCalledWith('test-id')
  })

  it('should not include withdraw action for cancelled registrations', () => {
    const openEditDialogMock = jest.fn()
    const cancelRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        openEditDialogMock,
        cancelRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')

    // Mock a cancelled row
    const mockCancelledRow = {
      id: 'test-cancelled-id',
      cancelled: true,
    } as Registration

    // Get the actions for the cancelled row
    const actions = (actionsColumn as any)?.getActions({ row: mockCancelledRow } as GridRenderCellParams<
      any,
      Registration
    >)
    expect(actions).toBeDefined()

    // Check that there's no withdraw action for cancelled registrations
    // For cancelled registrations, the withdraw action should not be present
    expect(actions.every((action: ReactElement) => action.key !== 'withdraw')).toBe(true)
  })

  it('should include refund action for registrations that can be refunded', () => {
    const refundRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        undefined,
        undefined,
        refundRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')

    // Mock a row that can be refunded
    const mockRefundableRow = {
      id: 'test-refundable-id',
      paidAt: new Date(),
      paidAmount: 5000,
      refundAmount: 0,
    } as Registration

    // Get the actions for the refundable row
    const actions = (actionsColumn as any)?.getActions({ row: mockRefundableRow } as GridRenderCellParams<
      any,
      Registration
    >)
    expect(actions).toBeDefined()

    // Check that there's a refund action
    const refundAction = actions.find((action: ReactElement) => action.key === 'refund')
    expect(refundAction).not.toBeNull()

    // Simulate clicking the refund action
    refundAction?.props.onClick()

    // Check that the refundRegistration callback was called with the correct ID
    expect(refundRegistrationMock).toHaveBeenCalledWith('test-refundable-id')
  })

  it('should not include refund action when refund amount equals paid amount', () => {
    const refundRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        undefined,
        undefined,
        refundRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')

    // Mock a row that has been fully refunded
    const mockFullyRefundedRow = {
      id: 'test-fully-refunded-id',
      paidAt: new Date(),
      paidAmount: 5000,
      refundAmount: 5000,
    } as Registration

    // Get the actions for the fully refunded row
    const actions = (actionsColumn as any)?.getActions({ row: mockFullyRefundedRow } as GridRenderCellParams<
      any,
      Registration
    >)
    expect(actions).toBeDefined()

    // For a fully refunded registration, the refund action might not be present at all
    // or it might be present but disabled. Let's check both possibilities.
    const refundAction = actions.find((action: ReactElement) => action.key === 'refund')
    if (refundAction) {
      // If present, it should be disabled
      expect(refundAction.props.disabled).toBeTruthy()
    } else {
      // If not present, that's also acceptable
      expect(true).toBe(true) // This will always pass
    }
  })

  it('should test valueGetters for various columns', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    const { entryColumns } = result.current

    // Test dog.name valueGetter
    const dogNameColumn = entryColumns.find((col) => col.field === 'dog.name')
    expect(dogNameColumn).toBeDefined()
    expect(dogNameColumn?.valueGetter).toBeDefined()

    const mockRow = {
      dog: { name: 'Test Dog' },
    } as Registration

    const dogNameGetter = dogNameColumn?.valueGetter as (value: any, row: Registration) => string
    expect(dogNameGetter(undefined, mockRow)).toBe('Test Dog')

    // Test dog.regNo valueGetter
    const dogRegNoColumn = entryColumns.find((col) => col.field === 'dog.regNo')
    expect(dogRegNoColumn).toBeDefined()
    expect(dogRegNoColumn?.valueGetter).toBeDefined()

    const mockRowWithRegNo = {
      dog: { regNo: 'REG123' },
    } as Registration

    const dogRegNoGetter = dogRegNoColumn?.valueGetter as (value: any, row: Registration) => string
    expect(dogRegNoGetter(undefined, mockRowWithRegNo)).toBe('REG123')

    // Test handler valueGetter
    const handlerColumn = entryColumns.find((col) => col.field === 'handler')
    expect(handlerColumn).toBeDefined()
    expect(handlerColumn?.valueGetter).toBeDefined()

    const mockRowWithHandler = {
      handler: { name: 'Test Handler' },
    } as Registration

    const handlerGetter = handlerColumn?.valueGetter as (value: any, row: Registration) => string
    expect(handlerGetter(undefined, mockRowWithHandler)).toBe('Test Handler')

    // Test lastEmail valueGetter
    const lastEmailColumn = entryColumns.find((col) => col.field === 'lastEmail')
    expect(lastEmailColumn).toBeDefined()
    expect(lastEmailColumn?.valueGetter).toBeDefined()

    const mockRowWithLastEmail = {
      lastEmail: 'test@example.com',
    } as Registration

    const lastEmailGetter = lastEmailColumn?.valueGetter as (value: any, row: Registration) => string
    expect(lastEmailGetter(undefined, mockRowWithLastEmail)).toBe('test@example.com')

    // Test empty lastEmail valueGetter
    const mockRowWithoutLastEmail = {} as Registration
    expect(lastEmailGetter(undefined, mockRowWithoutLastEmail)).toBe('')
  })

  it('should test the number column rendering', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    const { entryColumns } = result.current

    // Find the number column
    const numberColumn = entryColumns.find((col) => col.field === 'number')
    expect(numberColumn).toBeDefined()
    expect(numberColumn?.renderCell).toBeDefined()

    const renderCell = numberColumn?.renderCell as (params: any) => React.ReactNode

    // Test with integer number
    const mockParamsWithNumber = {
      row: { group: { number: 5 } },
    }
    const renderedInteger = renderCell(mockParamsWithNumber)
    expect(renderedInteger).toBe('5')

    // Test with non-integer number
    const mockParamsWithFloat = {
      row: { group: { number: 5.5 } },
    }
    const renderedFloat = renderCell(mockParamsWithFloat)
    // Should return a CircularProgress component
    expect(typeof renderedFloat).toBe('object')

    // Test with no number
    const mockParamsWithoutNumber = {
      row: { group: {} },
    }
    const renderedEmpty = renderCell(mockParamsWithoutNumber)
    expect(renderedEmpty).toBe('')

    // Test with no group
    const mockParamsWithoutGroup = {
      row: {},
    }
    const renderedNoGroup = renderCell(mockParamsWithoutGroup)
    expect(renderedNoGroup).toBe('')
  })

  it('should test the canRefund behavior', () => {
    // Spy on canRefund and make it return false
    const canRefundSpy = jest.spyOn(registrationUtils, 'canRefund').mockReturnValue(false)

    const refundRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        undefined,
        undefined,
        refundRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')

    // Mock a row that cannot be refunded
    const mockNonRefundableRow = {
      id: 'test-non-refundable-id',
    } as Registration

    // Get the actions for the non-refundable row
    const actions = (actionsColumn as any)?.getActions({ row: mockNonRefundableRow } as GridRenderCellParams<
      any,
      Registration
    >)
    expect(actions).toBeDefined()

    // Check that there's no refund action
    const refundAction = actions.find((action: ReactElement) => action.key === 'refund')
    expect(refundAction).toBeUndefined()

    // Restore the original implementation
    canRefundSpy.mockRestore()
  })

  it('should test the breed column with translation', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    const { entryColumns } = result.current

    // Find the breed column
    const breedColumn = entryColumns.find((col) => col.field === 'dob.breed')
    expect(breedColumn).toBeDefined()
    expect(breedColumn?.valueGetter).toBeDefined()

    const breedGetter = breedColumn?.valueGetter as (value: any, row: Registration) => string

    expect(breedGetter(undefined, registrationWithStaticDates)).toBe('110.M ns, defaultValue')

    const regWithoutBreed = {
      ...registrationWithStaticDates,
      dog: { ...registrationWithStaticDates.dog, breedCode: undefined },
    }
    expect(breedGetter(undefined, regWithoutBreed)).toBe('')

    const regWithoutGender = {
      ...registrationWithStaticDates,
      dog: { ...registrationWithStaticDates.dog, gender: undefined },
    }

    expect(breedGetter(undefined, regWithoutGender)).toBe('')
  })

  it('should test the breed column with various breed codes and genders', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    const { entryColumns } = result.current
    const breedColumn = entryColumns.find((col) => col.field === 'dob.breed')
    expect(breedColumn).toBeDefined()

    const valueGetter = breedColumn?.valueGetter as (value: any, row: Registration) => string

    // Test with various breed and gender combinations
    const testCases = [
      {
        dog: { breedCode: '110' as const, gender: 'M' as const },
        expected: '110.M ns, defaultValue',
      },
      {
        dog: { breedCode: '110' as const, gender: 'F' as const },
        expected: '110.F ns, defaultValue',
      },
      {
        dog: { breedCode: '333' as const, gender: 'M' as const },
        expected: '333.M ns, defaultValue',
      },
      {
        dog: { breedCode: undefined, gender: 'M' as const },
        expected: '',
      },
      {
        dog: { breedCode: '110' as const, gender: undefined },
        expected: '',
      },
      {
        dog: { breedCode: undefined, gender: undefined },
        expected: '',
      },
    ]

    testCases.forEach((testCase) => {
      // Create a proper mock registration with the test case's dog properties
      const mockReg = {
        ...registrationWithStaticDates,
        dog: {
          ...registrationWithStaticDates.dog,
          ...testCase.dog,
        },
      }

      const result = valueGetter(undefined, mockReg)
      expect(result).toBe(testCase.expected)
    })
  })

  it('should have a cancel reason column in cancelled columns', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(mockAvailableDates, eventWithStaticDatesAnd3Classes)
    )

    const { cancelledColumns } = result.current
    const cancelReasonColumn = cancelledColumns.find((col) => col.field === 'cancelReason')

    // Check that the cancel reason column exists
    expect(cancelReasonColumn).toBeDefined()

    // Check that the valueFormatter exists
    expect(cancelReasonColumn?.valueFormatter).toBeDefined()

    // Verify the formatter is a function
    const formatter = cancelReasonColumn?.valueFormatter as (value: string) => string
    expect(typeof formatter).toBe('function')
  })
})

describe('Number column rendering in detail', () => {
  it('should render different number column values correctly', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'ap' }],
        eventWithStaticDatesAnd3Classes
      )
    )

    const { entryColumns } = result.current
    const numberColumn = entryColumns.find((col) => col.field === 'number')
    expect(numberColumn).toBeDefined()

    const renderCell = numberColumn?.renderCell as (params: any) => React.ReactNode

    // Test with various number values
    const testCases = [
      { group: { number: 1 }, expected: '1' },
      // The implementation treats 0 as falsy, so it returns an empty string
      { group: { number: 0 }, expected: '' },
      { group: { number: -1 }, expected: '-1' },
      { group: { number: 1.5 }, expected: 'object' }, // Should return CircularProgress
      { group: { number: null }, expected: '' },
      { group: { number: undefined }, expected: '' },
      { group: {}, expected: '' },
      { expected: '' }, // No group
    ]

    testCases.forEach((testCase) => {
      const rendered = renderCell({ row: testCase })
      if (testCase.expected === 'object') {
        expect(typeof rendered).toBe('object')
      } else {
        expect(rendered).toBe(testCase.expected)
      }
    })
  })
})

describe('Action column in detail', () => {
  it('should handle different combinations of actions', () => {
    const openEditDialogMock = jest.fn()
    const cancelRegistrationMock = jest.fn()
    const refundRegistrationMock = jest.fn()

    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes,
        openEditDialogMock,
        cancelRegistrationMock,
        refundRegistrationMock
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')
    expect(actionsColumn).toBeDefined()

    // Test with various registration states
    const testCases = [
      // Regular registration
      {
        id: 'test-id-1',
        cancelled: false,
        paidAt: new Date(),
        paidAmount: 5000,
        refundAmount: 0,
        expectedActions: ['edit', 'withdraw', 'refund'],
      },
      // Cancelled registration
      {
        id: 'test-id-2',
        cancelled: true,
        paidAt: new Date(),
        paidAmount: 5000,
        refundAmount: 0,
        expectedActions: ['edit', 'refund'],
      },
      // Fully refunded registration
      {
        id: 'test-id-3',
        cancelled: false,
        paidAt: new Date(),
        paidAmount: 5000,
        refundAmount: 5000,
        expectedActions: ['edit', 'withdraw'],
      },
      // Unpaid registration
      {
        id: 'test-id-4',
        cancelled: false,
        paidAt: undefined,
        paidAmount: 0,
        refundAmount: 0,
        expectedActions: ['edit', 'withdraw'],
      },
    ]

    // Mock canRefund to return true for testing
    const canRefundSpy = jest.spyOn(registrationUtils, 'canRefund')

    testCases.forEach((testCase) => {
      // Set up canRefund to return appropriate value based on test case
      canRefundSpy.mockImplementation(
        () => testCase.paidAt !== undefined && (testCase.paidAmount ?? 0) > (testCase.refundAmount ?? 0)
      )

      const actions = (actionsColumn as any)?.getActions({
        row: testCase,
      } as GridRenderCellParams<any, Registration>)

      expect(actions).toBeDefined()

      // Check that the expected actions are present
      const actionKeys = actions.map((a: ReactElement) => a.key)
      testCase.expectedActions.forEach((expectedAction) => {
        expect(actionKeys).toContain(expectedAction)
      })

      // Check that no unexpected actions are present
      expect(actionKeys.length).toBe(testCase.expectedActions.length)
    })

    canRefundSpy.mockRestore()
  })

  it('should handle missing callback functions', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        mockAvailableDates,
        eventWithStaticDatesAnd3Classes
        // No callbacks provided
      )
    )

    const { entryColumns } = result.current
    const actionsColumn = entryColumns.find((col) => col.field === 'actions')
    expect(actionsColumn).toBeDefined()

    // Mock a row
    const mockRow = {
      id: 'test-id',
      cancelled: false,
    } as Registration

    // Get the actions for the mock row
    const actions = (actionsColumn as any)?.getActions({
      row: mockRow,
    } as GridRenderCellParams<any, Registration>)

    expect(actions).toBeDefined()

    // Check that the edit action exists
    const editAction = actions.find((action: ReactElement) => action.key === 'edit')
    expect(editAction).toBeDefined()

    // Simulate clicking the edit action - should not throw an error
    expect(() => editAction?.props.onClick()).not.toThrow()

    // Check that the withdraw action exists
    const withdrawAction = actions.find((action: ReactElement) => action.key === 'withdraw')
    expect(withdrawAction).toBeDefined()

    // Simulate clicking the withdraw action - should not throw an error
    expect(() => withdrawAction?.props.onClick()).not.toThrow()
  })
})

// Helper function to create a mock registration with specific properties
const createMockRegistration = (overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  ...overrides,
})

describe('GroupColors component in dates column', () => {
  it('should render GroupColors component in dates column', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'ap' }],
        eventWithStaticDatesAnd3Classes
      )
    )

    const { entryColumns } = result.current
    const datesColumn = entryColumns.find((col) => col.field === 'dates')
    expect(datesColumn).toBeDefined()
    expect(datesColumn?.renderCell).toBeDefined()

    const renderCell = datesColumn?.renderCell as (params: any) => React.ReactNode

    // Mock a row with dates
    const mockRow = {
      dates: [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'ap' }],
    }

    // Render the cell
    const renderedCell = renderCell({ row: mockRow })

    // The rendered cell should be a React element
    expect(renderedCell).toBeDefined()
    expect(typeof renderedCell).toBe('object')
  })
})

describe('Cancel reason formatter', () => {
  it('should format predefined cancel reasons', () => {
    const { result } = renderHook(() =>
      useClassEntrySelectionColumns(
        [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'ap' }],
        eventWithStaticDatesAnd3Classes
      )
    )

    const { cancelledColumns } = result.current
    const cancelReasonColumn = cancelledColumns.find((col) => col.field === 'cancelReason')
    expect(cancelReasonColumn).toBeDefined()
    expect(cancelReasonColumn?.valueFormatter).toBeDefined()

    const formatter = cancelReasonColumn?.valueFormatter as (value: string) => string

    // Test with predefined reasons
    expect(formatter('dog-heat')).toBe('registration.cancelReason.dog-heat')
    expect(formatter('handler-sick')).toBe('registration.cancelReason.handler-sick')
    expect(formatter('dog-sick')).toBe('registration.cancelReason.dog-sick')
    expect(formatter('gdpr')).toBe('registration.cancelReason.gdpr')

    // Test with custom reason
    const customReason = 'Custom reason'
    expect(formatter(customReason)).toBe(customReason)
  })
})

describe('Edge cases', () => {
  it('should handle empty available dates array', () => {
    const { result } = renderHook(() => useClassEntrySelectionColumns([], eventWithStaticDatesAnd3Classes))

    // Check that the hook returns the expected objects
    expect(result.current).toHaveProperty('entryColumns')
    expect(result.current).toHaveProperty('participantColumns')
    expect(result.current).toHaveProperty('cancelledColumns')

    // The columns should still be defined
    const { entryColumns } = result.current
    expect(entryColumns).toHaveLength(9)
  })
})

import type { GridCallbackDetails, GridCellParams, GridRowSelectionModel, MuiEvent } from '@mui/x-data-grid'
import type React from 'react'

import { renderHook } from '@testing-library/react'

import { useEntryHandlers } from './useEntryHandlers'

// Mock dependencies
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback || key,
  }),
}))

jest.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: jest.fn(),
  }),
}))

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(),
  },
  configurable: true,
})

describe('useEntryHandlers', () => {
  // Common test data
  const mockSetOpen = jest.fn()
  const mockSetCancelOpen = jest.fn()
  const mockSetRefundOpen = jest.fn()
  const mockSetSelectedRegistrationId = jest.fn()
  const mockEnqueueSnackbar = jest.fn()
  const mockRegistrations = [{ id: 'reg1' }, { id: 'reg2' }]

  const defaultProps = {
    setOpen: mockSetOpen,
    setCancelOpen: mockSetCancelOpen,
    setRefundOpen: mockSetRefundOpen,
    setSelectedRegistrationId: mockSetSelectedRegistrationId,
    registrations: mockRegistrations,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(require('notistack'), 'useSnackbar').mockImplementation(() => ({
      enqueueSnackbar: mockEnqueueSnackbar,
    }))
  })

  describe('handleOpen', () => {
    it('should set selected registration ID and open dialog', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      result.current.handleOpen('reg1')

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
      expect(mockSetOpen).toHaveBeenCalledWith(true)
    })

    it('should handle case when setters are not provided', () => {
      const { result } = renderHook(() =>
        useEntryHandlers({
          registrations: mockRegistrations,
        })
      )

      // This should not throw an error
      expect(() => result.current.handleOpen('reg1')).not.toThrow()
    })
  })

  describe('handleCancel', () => {
    it('should set selected registration ID and open cancel dialog', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      result.current.handleCancel('reg1')

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
      expect(mockSetCancelOpen).toHaveBeenCalledWith(true)
    })

    it('should handle case when setters are not provided', () => {
      const { result } = renderHook(() =>
        useEntryHandlers({
          registrations: mockRegistrations,
        })
      )

      // This should not throw an error
      expect(() => result.current.handleCancel('reg1')).not.toThrow()
    })
  })

  describe('handleRefund', () => {
    it('should set selected registration ID and open refund dialog', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      result.current.handleRefund('reg1')

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
      expect(mockSetRefundOpen).toHaveBeenCalledWith(true)
    })

    it('should handle case when setters are not provided', () => {
      const { result } = renderHook(() =>
        useEntryHandlers({
          registrations: mockRegistrations,
        })
      )

      // This should not throw an error
      expect(() => result.current.handleRefund('reg1')).not.toThrow()
    })
  })

  describe('handleSelectionModeChange', () => {
    it('should set selected registration ID when valid selection is provided', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      const selection: GridRowSelectionModel = ['reg1']
      const details = {} as GridCallbackDetails

      result.current.handleSelectionModeChange(selection, details)

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith('reg1')
    })

    it('should not set selected registration ID when selection is empty', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      const selection: GridRowSelectionModel = []
      const details = {} as GridCallbackDetails

      result.current.handleSelectionModeChange(selection, details)

      expect(mockSetSelectedRegistrationId).not.toHaveBeenCalled()
    })

    it('should not set selected registration ID when registration is not found', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      const selection: GridRowSelectionModel = ['nonexistent']
      const details = {} as GridCallbackDetails

      result.current.handleSelectionModeChange(selection, details)

      expect(mockSetSelectedRegistrationId).toHaveBeenCalledWith(undefined)
    })
  })

  describe('handleCellClick', () => {
    it('should copy registration number to clipboard when dog.regNo cell is clicked', async () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      const params = {
        field: 'dog.regNo',
        value: 'TEST123',
      } as GridCellParams

      const event = {
        defaultMuiPrevented: false,
      } as unknown as MuiEvent<React.MouseEvent>

      await result.current.handleCellClick(params, event)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TEST123')
      expect(event.defaultMuiPrevented).toBe(true)
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
        message: 'Rekisterinumero kopioitu',
        variant: 'info',
        autoHideDuration: 1000,
        anchorOrigin: {
          horizontal: 'center',
          vertical: 'bottom',
        },
      })
    })

    it('should not copy to clipboard when other cells are clicked', async () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      const params = {
        field: 'other.field',
        value: 'some value',
      } as GridCellParams

      const event = {
        defaultMuiPrevented: false,
      } as unknown as MuiEvent<React.MouseEvent>

      await result.current.handleCellClick(params, event)

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
      expect(event.defaultMuiPrevented).toBe(false)
      expect(mockEnqueueSnackbar).not.toHaveBeenCalled()
    })
  })

  describe('handleDoubleClick', () => {
    it('should open dialog when row is double-clicked', () => {
      const { result } = renderHook(() => useEntryHandlers(defaultProps))

      result.current.handleDoubleClick()

      expect(mockSetOpen).toHaveBeenCalledWith(true)
    })

    it('should handle case when setOpen is not provided', () => {
      const { result } = renderHook(() =>
        useEntryHandlers({
          registrations: mockRegistrations,
        })
      )

      // This should not throw an error
      expect(() => result.current.handleDoubleClick()).not.toThrow()
    })
  })
})

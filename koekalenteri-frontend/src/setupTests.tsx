// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import { DialogProps } from '@mui/material'
import { DataGridProps } from '@mui/x-data-grid'

// https://github.com/jsdom/jsdom/issues/3363
import 'core-js/stable/structured-clone'
import '@testing-library/jest-dom'
import './i18n'

// https://github.com/mui/mui-x/issues/1151#issuecomment-1108349639
jest.mock('@mui/x-data-grid', () => {
  const { DataGrid } = jest.requireActual('@mui/x-data-grid')
  return {
    ...jest.requireActual('@mui/x-data-grid'),
    DataGrid: (props: DataGridProps) => {
      return <DataGrid {...props} disableVirtualization autoPageSize={false} />
    },
  }
})

// disable portal for dialogs for spapshot testing
jest.mock('@mui/material', () => {
  const { Dialog } = jest.requireActual('@mui/material')
  return {
    ...jest.requireActual('@mui/material'),
    Dialog: (props: DialogProps) => {
      return <Dialog {...props} disablePortal />
    },
  }
})

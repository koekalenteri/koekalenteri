// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import { DataGridProps } from '@mui/x-data-grid'

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

import type {} from '@mui/x-data-grid/themeAugmentation'
import type {} from '@mui/x-date-pickers/themeAugmentation'

import { red } from '@mui/material/colors'
import { createTheme, responsiveFontSizes } from '@mui/material/styles'

declare module '@mui/material/styles/createPalette' {
  interface TypeBackground {
    caption: string
    form: string
    oddRow: string
    evenRow: string
    filter: string
    filterHeader: string
    tableHead: string
    ok: string
    hover: string
    selected: string
  }
}

export const HEADER_HEIGHT = '36px'

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1900,
    },
  },
  components: {
    MuiDatePicker: {
      defaultProps: {
        desktopModeMediaQuery: '(min-width:600px)',
      },
    },
    MuiDataGrid: {
      defaultProps: {
        rowHeight: 40,
      },
    },
    MuiStack: {
      defaultProps: {
        useFlexGap: true,
      },
    },
    MuiSwitch: {
      defaultProps: {
        color: 'success',
      },
    },
    MuiToggleButtonGroup: {
      defaultProps: {
        color: 'success',
      },
    },
  },
  mixins: {
    MuiDataGrid: {
      containerBackground: '#d8d8d8',
    },
  },
  palette: {
    primary: {
      light: '#547463',
      main: '#222',
      dark: '#1d392a',
      contrastText: '#fff',
    },
    secondary: {
      light: '#f7ebcf',
      main: '#fcfcfc', // '#98A59E',
      dark: '#aca189',
      contrastText: '#000',
    },
    error: {
      main: red.A400,
    },
    background: {
      caption: 'transparent',
      default: '#fcfdfd',
      filter: '#fff',
      filterHeader: '#d5e1db',
      form: '#f2f2f2',
      oddRow: '#ffffff',
      evenRow: '#f5f5f5',
      tableHead: '#d8d8d8',
      ok: '#c1d4c9',
      hover: '#AFC1B7',
      selected: '#D5E1DB',
    },
  },
  typography: {
    button: {
      textTransform: 'none',
    },
  },
  zIndex: {
    snackbar: 2200,
    drawer: 1000,
  },
})

export default responsiveFontSizes(theme)

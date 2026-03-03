import { red } from '@mui/material/colors'
import { createTheme, responsiveFontSizes } from '@mui/material/styles'

import '@mui/x-data-grid/themeAugmentation'
import '@mui/x-date-pickers/themeAugmentation'

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
      lg: 1200,
      md: 900,
      sm: 600,
      xl: 1900,
      xs: 0,
    },
  },
  components: {
    MuiDataGrid: {
      defaultProps: {
        rowHeight: 40,
      },
    },
    MuiDatePicker: {
      defaultProps: {
        desktopModeMediaQuery: '(min-width:600px)',
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
    background: {
      caption: 'transparent',
      default: '#fcfdfd',
      evenRow: '#f5f5f5',
      filter: '#fff',
      filterHeader: '#d5e1db',
      form: '#f2f2f2',
      hover: '#AFC1B7',
      oddRow: '#ffffff',
      ok: '#c1d4c9',
      selected: '#D5E1DB',
      tableHead: '#d8d8d8',
    },
    error: {
      main: red.A400,
    },
    primary: {
      contrastText: '#fff',
      dark: '#1d392a',
      light: '#547463',
      main: '#222',
    },
    secondary: {
      contrastText: '#000',
      dark: '#aca189',
      light: '#f7ebcf',
      main: '#fcfcfc', // '#98A59E',
    },
  },
  typography: {
    button: {
      textTransform: 'none',
    },
  },
  zIndex: {
    drawer: 1000,
    snackbar: 2200,
  },
})

export default responsiveFontSizes(theme)

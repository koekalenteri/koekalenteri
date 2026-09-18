import { green, lightBlue, red } from '@mui/material/colors'
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
    MuiButton: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible:not([data-navigation-button])': {
            '& .MuiTouchRipple-ripplePulsate': {
              display: 'none',
            },
            boxShadow: 'none',
            outline: '2px solid #1565c0',
            outlineOffset: 2,
          },
        },
      },
    },
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
  palette: {
    action: {
      // An unselected toggle button's label takes this, and 0.54 on the #f2f2f2 form ground is
      // 4.48 — under the line by two hundredths (KOE-1375).
      active: 'rgba(0, 0, 0, 0.6)', // 5.53 on the form ground
    },
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
    DataGrid: {
      headerBg: '#d8d8d8',
    },
    /**
     * The semantic colours are read as text — an error under a field, an info line beside a publish
     * button — and MUI's own mid-tone shades do not reach 4.5:1 at the sizes that text is set in
     * (KOE-1375). Each is the darkest shade the palette offers that clears the ratio on white and on
     * the #f2f2f2 form ground both, measured, so a `color: 'error.main'` anywhere is readable by
     * construction rather than by review. The numbers in the comments are white / form.
     */
    error: {
      main: red[800], // 5.62 / 5.02; was red.A400 at 3.85 / 3.44
    },
    info: {
      main: lightBlue[900], // 7.40 / 6.61; was lightBlue[700] at 3.86 / 3.49
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
    success: {
      main: green[900], // 7.87 / 7.03, and 5.84 on the ground a selected toggle button gives itself
    },
    warning: {
      // No orange in the Material palette is dark enough to be read as text: orange[900] stops at
      // 3.79 on white. This is that hue taken down until it clears the ratio.
      main: '#9a4b00', // 6.21 / 5.55
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

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

/** MUI's own type scale, as this theme had it before it set its heading sizes (KOE-1506). */
const muiTypography = responsiveFontSizes(createTheme()).typography

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
    MuiDatePickerToolbar: {
      styleOverrides: {
        // The phone picker's chosen date is set in the h4 variant, which is a heading size here; the
        // date keeps the size MUI drew it at.
        title: muiTypography.h4,
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
    MuiTypography: {
      defaultProps: {
        // MUI renders a subtitle as an h6 by default, so every label, column header and summary line
        // set in subtitle type became a heading and broke the outline (KOE-1506). A subtitle is a
        // paragraph; one that is a heading names its level with `component`.
        variantMapping: { subtitle1: 'p', subtitle2: 'p' },
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
  /**
   * A heading's level comes from where it sits on the page, so each level has to be a size a heading
   * at that level can wear (KOE-1506). MUI's own scale starts at 6rem, which pushed every section
   * heading down to h6 for its size and left the levels jumping. h1 to h3 are MUI's h4 to h6 moved up
   * three steps, so a page title and a section heading look as they did; h4 and h5 continue the
   * scale below h3.
   */
  typography: {
    button: {
      textTransform: 'none',
    },
    h1: { fontSize: '2.125rem', fontWeight: 400, letterSpacing: '0.00735em', lineHeight: 1.235 },
    h2: { fontSize: '1.5rem', fontWeight: 400, letterSpacing: '0em', lineHeight: 1.334 },
    h3: { fontSize: '1.25rem', fontWeight: 500, letterSpacing: '0.0075em', lineHeight: 1.6 },
    h4: { fontSize: '1.125rem', fontWeight: 500, letterSpacing: '0.0075em', lineHeight: 1.6 },
    h5: { fontSize: '1rem', fontWeight: 500, letterSpacing: '0.0075em', lineHeight: 1.6 },
  },
  zIndex: {
    drawer: 1000,
    snackbar: 2200,
  },
})

export default responsiveFontSizes(theme)

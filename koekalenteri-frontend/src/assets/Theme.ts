import { red } from '@mui/material/colors';
import { createTheme, Theme, responsiveFontSizes } from '@mui/material/styles';

declare module '@mui/styles/defaultTheme' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultTheme extends Theme {}
}

declare module '@mui/material/styles/createPalette' {
  interface TypeBackground {
    form: string
    oddRow: string
    tableHead: string
    ok: string
  }
}

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1900,
    }
  },
  palette: {
    primary: {
      light: '#547463',
      main: '#000',
      dark: '#1d392a',
      contrastText: '#fff',
    },
    secondary: {
      light: '#f7ebcf',
      main: '#98A59E',
      dark: '#aca189',
      contrastText: '#000',
    },
    error: {
      main: red.A400,
    },
    background: {
      default: '#fcfdfd',
      form: '#f2f2f2',
      oddRow: '#f8f8f8',
      tableHead: '#C4C4C4',
      ok: '#c1d4c9'
    },
  },
  zIndex: {
    snackbar: 1200,
    drawer: 1000
  }
})

export default responsiveFontSizes(theme);

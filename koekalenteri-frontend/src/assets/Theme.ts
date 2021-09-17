import { red } from '@mui/material/colors';
import { createTheme, Theme } from '@mui/material/styles';

declare module '@mui/styles/defaultTheme' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultTheme extends Theme {}
}

const theme = createTheme({
  palette: {
    primary: {
      light: '#547463',
      main: '#98A59E',
      dark: '#1d392a',
      contrastText: '#fff',
    },
    secondary: {
      light: '#f7ebcf',
      main: '#f6e6c4',
      dark: '#aca189',
      contrastText: '#000',
    },
    error: {
      main: red.A400,
    },
    background: {
      default: '#fcfdfd',
    },
  },
})

export default theme;

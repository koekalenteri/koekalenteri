import ReactDOM from 'react-dom';
import { ThemeProvider, StyledEngineProvider, CssBaseline } from '@mui/material';
import "./index.css";
import "./i18n";
import App from './App';
import theme from './assets/Theme';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from "react-router-dom";

ReactDOM.render(
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StyledEngineProvider>,
  document.getElementById('root')
);

reportWebVitals();

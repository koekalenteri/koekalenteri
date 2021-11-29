import { render, screen } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import theme from './assets/Theme';

jest.mock('./api/event');
jest.mock('./api/judge');
jest.mock('./api/organizer');

test('renders logo with proper ALT', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  const imgElement = screen.getByAltText('Suomen noutajakoirajärjestö');
  expect(imgElement).toBeInTheDocument();
});

test('renders event page', async () => {
  const {findByText, getByRole} = render(
    <MemoryRouter initialEntries={['/event/type2/test2']}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const spinner = getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const organizer = await findByText(/Test org/);
  expect(organizer).toBeInTheDocument();
  expect(spinner).not.toBeInTheDocument();
});

import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import theme from './assets/Theme';
import { ADMIN_EVENTS, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS } from './config';
import { DataGridProps } from '@mui/x-data-grid';

jest.mock('./api/event');
jest.mock('./api/judge');
jest.mock('./api/organizer');

// DataGrid needs disableVirtualizaton to render properly in tests
jest.mock('@mui/x-data-grid', () => {
  const { DataGrid } = jest.requireActual('@mui/x-data-grid');
  return {
    ...jest.requireActual('@mui/x-data-grid'),
    DataGrid: (props: DataGridProps) => {
      return (
        <DataGrid
          {...props}
          disableVirtualization
        />
      );
    },
  };
});

test('renders logo with proper ALT', () => {
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const imgElement = screen.getByAltText('Suomen noutajakoirajärjestö');
  expect(imgElement).toBeInTheDocument();
});

test('renders event page', async () => {
  render(
    <MemoryRouter initialEntries={['/event/type2/test2']}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const spinner = screen.getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const organizer = await screen.findByText(/Test org/);
  expect(organizer).toBeInTheDocument();
  expect(spinner).not.toBeInTheDocument();
});

test('renders admin default (event) page', async () => {
  render(
    <MemoryRouter initialEntries={[ADMIN_ROOT]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const head = await screen.findAllByText(/Tapahtumat/);
  expect(head.length).toBe(2);

  // Select an event, and click edit button
  const row = screen.getAllByRole('row')[1];
  fireEvent.click(row, 'click');
  expect(row).toHaveClass('Mui-selected');
  fireEvent.click(screen.getByText(/Muokkaa/));
  const newHead = await screen.findByText('Muokkaa tapahtumaa');
  expect(newHead).toBeInstanceOf(HTMLHeadingElement);
});

test('renders admin createEvent page', async () => {
  render(
    <MemoryRouter initialEntries={[ADMIN_EVENTS, ADMIN_NEW_EVENT]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const head = await screen.findByText(/Uusi tapahtuma/);
  expect(head).toBeInTheDocument();
});

test('renders admin organizations', async () => {
  render(
    <MemoryRouter initialEntries={[ADMIN_ORGS]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const head = await screen.findAllByText(/Yhdistykset/);
  expect(head.length).toBe(2);
});

test('renders admin users', async () => {
  render(
    <MemoryRouter initialEntries={[ADMIN_USERS]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const head = await screen.findAllByText(/Käyttäjät/);
  expect(head.length).toBe(2);
});

test('renders admin judges', async () => {
  render(
    <MemoryRouter initialEntries={[ADMIN_JUDGES]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
  const head = await screen.findAllByText(/Tuomarit/);
  expect(head.length).toBe(2);
});

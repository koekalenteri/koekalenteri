import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import theme from './assets/Theme';
import { ADMIN_EVENT_TYPES, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS, ADMIN_VIEW_EVENT } from './config';
import { DataGridProps } from '@mui/x-data-grid';

jest.mock('./api/event');
jest.mock('./api/judge');
jest.mock('./api/official');
jest.mock('./api/organizer');
jest.mock('./api/eventType');

jest.mock('@aws-amplify/ui-react');

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
  render(<ThemeProvider theme={theme}><App /></ThemeProvider>, {wrapper: MemoryRouter});
  const imgElement = screen.getByAltText('Suomen noutajakoirajärjestö');
  expect(imgElement).toBeInTheDocument();
});

function renderPath(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
}

test('renders event page', async () => {
  renderPath('/event/NOME-B/test2');
  const spinner = screen.getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const organizer = await screen.findByText(/Test org/);
  expect(organizer).toBeInTheDocument();
  expect(spinner).not.toBeInTheDocument();
});

test('renders event page with date selected', async () => {
  renderPath('/event/NOME-B/test2/13.02.');
  const spinner = screen.getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const organizer = await screen.findByText(/Test org/);
  expect(organizer).toBeInTheDocument();
  expect(spinner).not.toBeInTheDocument();
});

test('renders admin default (event) page', async () => {
  renderPath(ADMIN_ROOT);
  const head = await screen.findAllByText(/Tapahtumat/);
  expect(head.length).toBe(2);

  // Select an event, and click edit button
  const row = screen.getAllByRole('row')[1];
  const cell = within(row).getAllByRole('cell')[0];
  fireEvent.click(cell, 'click');
  expect(row).toHaveClass('Mui-selected');
  fireEvent.click(screen.getByText(/Muokkaa/));
  const newHead = await screen.findByText(/Muokkaa tapahtumaa/);
  expect(newHead).toBeInstanceOf(HTMLDivElement);
});

test('renders admin createEvent page', async () => {
  renderPath(ADMIN_NEW_EVENT);
  const head = await screen.findByText(/Uusi tapahtuma/);
  expect(head).toBeInTheDocument();
});

test('renders admin EventViewPage', async () => {
  renderPath(`${ADMIN_VIEW_EVENT}/test1`);
  const spinner = screen.getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const head = await screen.findByText(/type1, 10.-11.2.2021, test location/i);
  expect(head).toBeInTheDocument();
})

test('renders admin organizations', async () => {
  renderPath(ADMIN_ORGS);
  const head = await screen.findAllByText(/Yhdistykset/);
  expect(head.length).toBe(3);
});

test('renders admin users', async () => {
  renderPath(ADMIN_USERS);
  const head = await screen.findAllByText(/Käyttäjät/);
  expect(head.length).toBe(2);
});

test('renders admin judges', async () => {
  renderPath(ADMIN_JUDGES);
  const head = await screen.findAllByText(/Tuomarit/);
  expect(head.length).toBe(3);
});

test('renders admin eventTypes', async () => {
  renderPath(ADMIN_EVENT_TYPES);
  const head = await screen.findAllByText(/Koemuodot/);
  expect(head.length).toBe(3);
});

test('renders logout page', async () => {
  renderPath('/logout');
  expect(await screen.findByText('Kirjaudu')).toBeInTheDocument();
});

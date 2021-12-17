import { render, screen } from '@testing-library/react';
import { EventTable } from './EventTable';
import { emptyEvent } from '../api/test-utils/emptyEvent';
import { MemoryRouter } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { ThemeProvider } from '@mui/material';
import theme from '../assets/Theme';

test('It should render error text on empty result', () => {
  render(
    <ThemeProvider theme={theme}>
      <EventTable events={[]} />
    </ThemeProvider>
  );
  expect(screen.getByText(/Tekemälläsi haulla ei löytynyt tapahtumia. Poista joku hakusuodattimista./i)).toBeInTheDocument();
});

test('It should render event dates', async function() {
  const event = { ...emptyEvent, startDate: parseISO('2021-02-10'), endDate: parseISO('2021-02-11'), isEntryOpen: false, isEntryClosing: false, isEntryUpcoming: false };
  render(
    <ThemeProvider theme={theme}>
      <EventTable events={[event]} />
    </ThemeProvider>
  );
  expect(screen.getByText(/10.-11.2.2021/)).toBeInTheDocument();
});

test('It should render registration link', async function() {
  const event = { ...emptyEvent, id: 'eventID', eventType: 'TestType', isEntryOpen: true, isEntryClosing: false, isEntryUpcoming: false };
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <EventTable events={[event]} />
      </MemoryRouter>
    </ThemeProvider>);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/event/TestType/eventID');
});

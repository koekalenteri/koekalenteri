import { render, screen } from '@testing-library/react';
import { EventTable } from './EventTable';
import { emptyEvent } from '../api/test-utils/emptyEvent';
import { MemoryRouter } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { ThemeProvider } from '@mui/material';
import theme from '../assets/Theme';
import { EventEx } from 'koekalenteri-shared/model';

test('It should render error text on empty result', () => {
  render(
    <ThemeProvider theme={theme}>
      <EventTable events={[]} />
    </ThemeProvider>
  );
  expect(screen.getByText(/Tekemälläsi haulla ei löytynyt tapahtumia. Poista joku hakusuodattimista./i)).toBeInTheDocument();
});

test('It should render event dates', async function() {
  const event: EventEx = {
    ...emptyEvent,
    startDate: parseISO('2021-02-10'),
    endDate: parseISO('2021-02-11'),

    isEntryUpcoming: false,
    isEntryOpen: false,
    isEntryClosing: false,
    isEntryClosed: false,

    isEventUpcoming: false,
    isEventOngoing: false,
    isEventOver: true,
  };
  render(
    <ThemeProvider theme={theme}>
      <EventTable events={[event]} />
    </ThemeProvider>
  );
  expect(screen.getByText(/10.-11.2.2021/)).toBeInTheDocument();
});

test('It should render registration link', async function() {
  const event = {
    ...emptyEvent,
    id: 'eventID',
    eventType: 'TestType',

    isEntryUpcoming: false,
    isEntryOpen: true,
    isEntryClosing: false,
    isEntryClosed: false,

    isEventUpcoming: true,
    isEventOngoing: false,
    isEventOver: true,

  };
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <EventTable events={[event]} />
      </MemoryRouter>
    </ThemeProvider>);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/event/TestType/eventID');
});

import { render } from '@testing-library/react';
import { EventTable } from './EventTable';
import { emptyEvent } from 'koekalenteri-shared/src/test-utils/emptyEvent';
import { MemoryRouter } from 'react-router';
import { parseISO } from 'date-fns';

test('It should render error text on empty result', () => {
  const {getByText} = render(<EventTable events={[]} ></EventTable>);
  expect(getByText(/Tekemälläsi haulla ei löytynyt tapahtumia. Poista joku hakusuodattimista./i)).toBeInTheDocument();
});

test('It should render event dates', async function() {
  const event = { ...emptyEvent, startDate: parseISO('2021-02-10'), endDate: parseISO('2021-02-11'), isEntryOpen: false, isEntryClosing: false, isEntryUpcoming: false };
  const { getByText } = render(<EventTable events={[event]} ></EventTable>);
  expect(getByText(/10.-11.2.2021/)).toBeInTheDocument();
});

test('It should render registration link', async function() {
  const event = { ...emptyEvent, id: 'eventID', eventType: 'TestType', isEntryOpen: true, isEntryClosing: false, isEntryUpcoming: false };
  const { getByRole } = render(<MemoryRouter><EventTable events={[event]} ></EventTable></MemoryRouter>);
  expect(getByRole('link')).toHaveAttribute('href', '/event/TestType/eventID');
});

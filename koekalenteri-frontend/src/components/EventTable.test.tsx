import { render } from '@testing-library/react';
import EventTable from './EventTable';
import { emptyEvent } from 'koekalenteri-shared/src/test-utils/emptyEvent';

test('It should render error text on empty result', () => {
  const {getByText} = render(<EventTable events={[]} ></EventTable>);
  expect(getByText(/Tekemälläsi haulla ei löytynyt tapahtumia. Poista joku hakusuodattimista./i)).toBeInTheDocument();
});

test('It should render event dates', async function() {
  const event = { ...emptyEvent, startDate: new Date('2021-02-10'), endDate: new Date('2021-02-11'), isEntryOpen: false };
  const { getByText } = render(<EventTable events={[event]} ></EventTable>);
  expect(getByText(/10.-11.2.2021/)).toBeInTheDocument();
});

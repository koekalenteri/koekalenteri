import { render } from '@testing-library/react';
import EventTable from './EventTable';

test('It should render error text on empty result', () => {
  const {getByText} = render(<EventTable events={[]} ></EventTable>);
  expect(getByText(/Tekemälläsi haulla ei löytynyt tapahtumia. Poista joku hakusuodattimista./i)).toBeInTheDocument();
});

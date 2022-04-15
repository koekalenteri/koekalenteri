import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, within, screen } from '@testing-library/react';
import { EventFilter } from './';
import { FilterProps } from '../stores/PublicStore';
import { Judge, Organizer } from 'koekalenteri-shared/model';

const judges: Judge[] = [
  {
    name: "Tuomari 1",
    id: 123,
    location: "Ranua",
    district: "Piiri",
    phone: "n/a",
    email: "n/a",
    languages: ['fi', 'se'],
    eventTypes: ['NOU', 'NOME-B']
  },
  {
    name: "Tuomari 2",
    id: 234,
    location: "Lohja",
    district: "Piiri",
    phone: "n/a",
    email: "n/a",
    languages: ['fi'],
    eventTypes: ['NOU']
  },
];

const organizers: Organizer[] = [
  {
    id: 1,
    name: 'Järjestäjä 1'
  },
  {
    id: 2,
    name: 'Test org'
  }
];

const renderComponent = (filter: FilterProps, onChange?: ((filter: FilterProps) => void)) => render(
  <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
    <EventFilter judges={judges} organizers={organizers} filter={filter} onChange={onChange}></EventFilter>
  </LocalizationProvider>
);

test('should render', () => {
  renderComponent({ start: null, end: null, eventType: ['NOME-B'], eventClass: ['ALO'], judge: [234], organizer: [2]});

  expect(screen.getByTestId(/Koemuoto/i)).toHaveTextContent(/NOME-B/i);
  expect(screen.getByTestId(/Koeluokka/i)).toHaveTextContent(/ALO/i);
  expect(screen.getByTestId(/Tuomari/i)).toHaveTextContent(/Tuomari 2/i);
  expect(screen.getByTestId(/Järjestäjä/i)).toHaveTextContent(/Test org/i);
});

function changeAutocompleteValue(testId: string, value: string) {
  const autocomplete = screen.getByTestId(testId);
  const input = within(autocomplete).getByRole('combobox');
  autocomplete.focus();
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(autocomplete, { key: 'ArrowDown' })
  fireEvent.keyDown(autocomplete, { key: 'Enter' })
}

test('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  renderComponent({ start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] }, changeHandler);

  changeAutocompleteValue('Koemuoto', 'NOME-A');
  expect(changeHandler).toHaveBeenCalledTimes(1);

  changeAutocompleteValue('Koeluokka', 'VOI');
  expect(changeHandler).toHaveBeenCalledTimes(2);

  changeAutocompleteValue('Tuomari', 'Tuomari 1');
  expect(changeHandler).toHaveBeenCalledTimes(3);

  changeAutocompleteValue('Järjestäjä', 'Järjestäjä 1');
  expect(changeHandler).toHaveBeenCalledTimes(4);

  const dateInputs = screen.getAllByLabelText('Choose date', { exact: false });
  fireEvent.click(dateInputs[0]);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));
  expect(changeHandler).toHaveBeenCalledTimes(5);

  fireEvent.click(screen.getByLabelText(/Ilmoittautuminen auki/i));
  expect(changeHandler).toHaveBeenCalledTimes(6);

  fireEvent.click(screen.getByLabelText(/Vielä mahtuu/i));
  expect(changeHandler).toHaveBeenCalledTimes(7);

  fireEvent.click(screen.getByLabelText(/Ilmoittautuminen tulossa/i));
  expect(changeHandler).toHaveBeenCalledTimes(8);

  fireEvent.click(screen.getByLabelText(/Vielä ehdit!/i));
  expect(changeHandler).toHaveBeenCalledTimes(9);
});

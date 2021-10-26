import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, within, screen, waitFor } from '@testing-library/react';
import EventFilter from './EventFilter';
import { FilterProps } from '../stores/EventStrore';
import { Judge, Organizer } from 'koekalenteri-shared/model';

const judges: Judge[] = [
  {
    name: "Tuomari 1",
    id: 123,
    location: "Ranua",
    phone: "n/a",
    email: "n/a",
    languages: ['fi', 'se'],
    eventTypes: ['NOU', 'NOME-B']
  },
  {
    name: "Tuomari 2",
    id: 234,
    location: "Lohja",
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
  const { getByLabelText } = renderComponent({ start: null, end: null, eventType: ['NOME-B'], eventClass: ['ALO'], judge: [234], organizer: [2]});

  expect(getByLabelText(/Koetyyppi/i)).toHaveTextContent(/NOME-B/i);
  expect(getByLabelText(/Koeluokka/i)).toHaveTextContent(/ALO/i);
  expect(getByLabelText(/Tuomari/i)).toHaveTextContent(/234/i);
  expect(getByLabelText(/Järjestäjä/i)).toHaveTextContent(/2/i);
});

test('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  const { getByLabelText, getByRole, getAllByLabelText } = renderComponent({ start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] }, changeHandler);

  fireEvent.mouseDown(getByLabelText(/Koetyyppi/i));
  fireEvent.click(within(getByRole('listbox')).getByText(/NOME-A/i));
  expect(changeHandler).toHaveBeenCalledTimes(1);

  fireEvent.mouseDown(getByLabelText(/Koeluokka/i));
  fireEvent.click(within(getByRole('listbox')).getByText(/VOI/i));
  expect(changeHandler).toHaveBeenCalledTimes(2);

  const dateInputs = getAllByLabelText('Choose date', { exact: false }) as HTMLInputElement[];
  fireEvent.click(dateInputs[0]);
  await waitFor(() => screen.getByRole('dialog'));
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));
  expect(changeHandler).toHaveBeenCalledTimes(3);

  fireEvent.mouseDown(getByLabelText(/Tuomari/i));
  fireEvent.click(within(getByRole('listbox')).getByText(/Tuomari 1/i));
  expect(changeHandler).toHaveBeenCalledTimes(4);

  fireEvent.mouseDown(getByLabelText(/Järjestäjä/i));
  fireEvent.click(within(getByRole('listbox')).getByText(/Järjestäjä 1/i));
  expect(changeHandler).toHaveBeenCalledTimes(5);
});

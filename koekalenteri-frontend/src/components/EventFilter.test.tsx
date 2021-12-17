import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, within, screen } from '@testing-library/react';
import { EventFilter } from './';
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
  renderComponent({ start: null, end: null, eventType: ['NOME-B'], eventClass: ['ALO'], judge: [234], organizer: [2]});

  expect(screen.getByLabelText(/Koemuoto/i)).toHaveTextContent(/NOME-B/i);
  expect(screen.getByLabelText(/Koeluokka/i)).toHaveTextContent(/ALO/i);
  expect(screen.getByLabelText(/Tuomari/i)).toHaveTextContent(/Tuomari 2/i);
  expect(screen.getByLabelText(/Järjestäjä/i)).toHaveTextContent(/Test org/i);
});

test('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  renderComponent({ start: null, end: null, eventType: [], eventClass: [], judge: [], organizer: [] }, changeHandler);

  fireEvent.mouseDown(screen.getByLabelText(/Koemuoto/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/NOME-A/i));
  expect(changeHandler).toHaveBeenCalledTimes(1);

  fireEvent.mouseDown(screen.getByLabelText(/Koeluokka/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/VOI/i));
  expect(changeHandler).toHaveBeenCalledTimes(2);

  const dateInputs = screen.getAllByLabelText('Choose date', { exact: false }) as HTMLInputElement[];
  fireEvent.click(dateInputs[0]);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));
  expect(changeHandler).toHaveBeenCalledTimes(3);

  fireEvent.mouseDown(screen.getByLabelText(/Tuomari/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Tuomari 1/i));
  expect(changeHandler).toHaveBeenCalledTimes(4);

  fireEvent.mouseDown(screen.getByLabelText(/Järjestäjä/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Järjestäjä 1/i));
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

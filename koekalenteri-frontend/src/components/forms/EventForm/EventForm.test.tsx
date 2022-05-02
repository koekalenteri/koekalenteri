import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { Event, Judge, Official, Organizer } from 'koekalenteri-shared/model';
import { EventForm, FormEventHandler } from '.';
import theme from '../../../assets/Theme';

const eventTypes = ['TEST-A', 'TEST-B', 'TEST-C'];
const eventTypeClasses = {
  'TEST-A': ['A', 'B', 'C'],
  'TEST-B': ['B', 'C'],
  'TEST-C': [],
};

const JUDGES = [{
  id: 1,
  name: 'Test Judge',
  email: 'joo@ei.com',
  phone: '0700-judge',
  location: 'Pohjois-Karjala',
  district: 'Pohjois-Karjalan Kennelpiiri ry',
  languages: ['fi'],
  eventTypes: ['TEST-A', 'TEST-C']
}];

const ORGANIZERS = [{
  id: 1,
  name: 'SNJ r.y'
}];

const OFFICIALS = [{
  id: 1000,
  name: 'Teemu Toimitsija',
  email: 'joo@ei.com',
  phone: '0700-official',
  location: 'Perähikiä',
  district: 'Hikiä',
  eventTypes: ['TEST-A', 'TEST-C']
}];

const renderComponent = (event: Partial<Event>, judges: Judge[], officials: Official[], organizers: Organizer[], onSave: FormEventHandler, onCancel: FormEventHandler) => render(
  <ThemeProvider theme={theme}>
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <EventForm
        event={event}
        eventTypes={eventTypes}
        eventTypeClasses={eventTypeClasses}
        judges={judges}
        officials={officials}
        organizers={organizers}
        onSave={onSave}
        onCancel={onCancel}
      />
    </LocalizationProvider>
  </ThemeProvider>
);


test('It should fire onSave and onCancel', async () => {
  const saveHandler = jest.fn();
  const cancelHandler = jest.fn();
  renderComponent({
    id: 'test',
    state: 'draft',
    eventType: 'TEST-A',
    organizer: ORGANIZERS[0],
    secretary: OFFICIALS[0]
  }, JUDGES, OFFICIALS, ORGANIZERS, saveHandler, cancelHandler);

  const saveButton = screen.getByText(/Tallenna/i);
  expect(saveButton).toBeDisabled();

  // Make a change to enable save button
  fireEvent.mouseDown(screen.getByLabelText(/Koemuoto/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/TEST-C/i));

  expect(saveButton).toBeEnabled();

  fireEvent.click(saveButton);
  expect(saveHandler).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText(/Peruuta/i));
  expect(cancelHandler).toHaveBeenCalledTimes(1);
});

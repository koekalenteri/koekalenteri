import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { Event, Judge } from 'koekalenteri-shared/model';
import { EventForm, EventHandler } from '.';
import theme from '../assets/Theme';

const renderComponent = (event: Partial<Event>, judges: Judge[], onSave: EventHandler, onCancel: EventHandler) => render(
  <ThemeProvider theme={theme}>
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <EventForm event={event} judges={judges} onSave={onSave} onCancel={onCancel}></EventForm>
    </LocalizationProvider>
  </ThemeProvider>
);

const JUDGES = [{
  id: 1,
  name: 'Test Judge',
  email: 'joo@ei.com',
  phone: '0700-judge',
  location: 'Pohjois-Karjala',
  languages: ['fi'],
  eventTypes: ['NOWT']
}];

test('It should fire onSave and onCancel', async () => {
  const saveHandler = jest.fn();
  const cancelHandler = jest.fn();
  renderComponent({ id: 'test' }, JUDGES, saveHandler, cancelHandler);

  fireEvent.click(screen.getByText(/Tallenna/i));
  expect(saveHandler).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText(/Peruuta/i));
  expect(cancelHandler).toHaveBeenCalledTimes(1);
});

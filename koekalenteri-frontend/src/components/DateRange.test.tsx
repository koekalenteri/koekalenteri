import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateRange, DateRangeProps } from '.';
import { parseISO, startOfMonth } from 'date-fns';

const renderComponent = (props: DateRangeProps) => {
  render(
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <DateRange {...props} />
    </LocalizationProvider>
  );

  const inputs = screen.getAllByLabelText('Choose date', { exact: false }) as HTMLInputElement[];
  return { startInput: inputs[0], endInput: inputs[1] };
}

test('should render labels', () => {
  renderComponent({ startLabel: 'Start Label', start: parseISO('2021-01-01'), endLabel: 'End Label', end: parseISO('2021-02-01') });

  expect(screen.getAllByText('Start Label').length).toEqual(2);
  expect(screen.getAllByText('End Label').length).toEqual(2);
});

test('should render labels when required', () => {
  renderComponent({ startLabel: 'Start Label', start: parseISO('2021-01-01'), endLabel: 'End Label', end: parseISO('2021-02-01'), required: true });

  expect(screen.getAllByText('Start Label').length).toEqual(1);
  expect(screen.getAllByText('End Label').length).toEqual(1);
  expect(screen.getAllByText('*').length).toEqual(2);
});

test('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  const { startInput, endInput } = renderComponent({ startLabel: 'start', start: startOfMonth(new Date()), endLabel: 'end', end: null, onChange: changeHandler });

  fireEvent.click(startInput);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));

  screen.getByRole('dialog').remove(); // Should be removed automatically, no idea why this is needed

  expect(changeHandler).toHaveBeenCalled();

  fireEvent.click(endInput);
  await screen.findByRole('dialog', {hidden: false});
  fireEvent.click(screen.getByLabelText('26. ', { exact: false }));

  expect(changeHandler).toHaveBeenCalledTimes(2);
});

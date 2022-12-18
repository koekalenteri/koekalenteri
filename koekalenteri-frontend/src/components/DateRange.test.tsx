import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { fireEvent, render, screen } from '@testing-library/react';
import { parseISO, startOfMonth } from 'date-fns';
import fi from 'date-fns/locale/fi';

import { DateRange, DateRangeProps } from '.';

const renderComponent = (props: DateRangeProps) => {
  render(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
      <DateRange {...props} />
    </LocalizationProvider>
  );

  const inputs = screen.getAllByLabelText('Choose date', { exact: false });
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

test.skip('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  const { startInput, endInput } = renderComponent({ startLabel: 'start', start: startOfMonth(new Date()), endLabel: 'end', end: null, onChange: changeHandler });

  fireEvent.click(startInput);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));

  expect(changeHandler).toHaveBeenCalled();

  fireEvent.click(endInput);
  await screen.findByRole('dialog', {hidden: false});
  fireEvent.click(screen.getByLabelText('26. ', { exact: false }));

  expect(changeHandler).toHaveBeenCalledTimes(2);
});

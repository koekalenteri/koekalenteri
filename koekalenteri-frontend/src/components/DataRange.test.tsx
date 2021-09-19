import fi from 'date-fns/locale/fi';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DateRange, { DateRangeProps } from './DateRange';

const renderComponent = (props: DateRangeProps) => {
  const utils = render(
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <DateRange {...props} />
    </LocalizationProvider>
  );

  const inputs = utils.getAllByLabelText('Choose date', { exact: false }) as HTMLInputElement[];
  return { ...utils, startInput: inputs[0], endInput: inputs[1] };
}

test('should render labels', () => {
  const {getAllByText} = renderComponent({ startLabel: 'Start Label', start: new Date('2021-01-01'), endLabel: 'End Label', end: new Date('2021-02-01') });

  expect(getAllByText('Start Label').length).toEqual(2);
  expect(getAllByText('End Label').length).toEqual(2);
});

test('It should fire onChange', async () => {
  const changeHandler = jest.fn();
  const { startInput } = renderComponent({ startLabel: 'start', start: new Date(), endLabel: 'end', end: null, onChange: changeHandler });

  fireEvent.click(startInput);
  await waitFor(() => screen.getByRole('dialog'));
  fireEvent.click(screen.getByLabelText('25. ', { exact: false }));

  expect(changeHandler).toHaveBeenCalled();
});

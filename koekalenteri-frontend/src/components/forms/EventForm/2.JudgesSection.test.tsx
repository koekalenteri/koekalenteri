import { fireEvent, render, screen, within } from '@testing-library/react';
import { JudgesSection } from './2.JudgesSection';

const JUDGES = [{
  id: 1,
  name: 'Test Judge 1',
  email: 'joo@ei.com',
  phone: '0700-judge',
  location: 'Pohjois-Karjala',
  district: 'Pohjois-Karjalan Kennelpiiri ry',
  languages: ['fi'],
  eventTypes: ['NOWT']
}, {
  id: 2,
  name: 'Test Judge 2',
  email: 'joo2@ei.com',
  phone: '0700-judge2',
  location: 'Pohjois-Karjala',
  district: 'Pohjois-Karjalan Kennelpiiri ry',
  languages: ['fi'],
  eventTypes: ['NOWT']
}, {
  id: 3,
  name: 'Test Judge 3',
  email: 'joo3@ei.com',
  phone: '0700-judge3',
  location: 'Pohjois-Karjala',
  district: 'Pohjois-Karjalan Kennelpiiri ry',
  languages: ['fi'],
  eventTypes: ['NOWT']
}];

test('It should fire onChange', async () => {
  const testEvent = {
    id: 'test',
    judges: [1],
    startDate: new Date('2022-06-01'),
    endDate: new Date('2022-06-02'),
    classes: [
      { class: 'c1', date: new Date('2022-06-01') },
      { class: 'c2', date: new Date('2022-06-01') },
      { class: 'c3', date: new Date('2022-06-01') },
      { class: 'c1', date: new Date('2022-06-02') },
      { class: 'c2', date: new Date('2022-06-02') },
      { class: 'c3', date: new Date('2022-06-02') },
    ]
  };

  const changeHandler = jest.fn((props) => Object.assign(testEvent, props));

  const { rerender } = render(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  fireEvent.mouseDown(screen.getByLabelText(/Ylituomari/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 3/i));

  rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  expect(changeHandler).toHaveBeenCalledTimes(1);
  expect(testEvent.judges.length).toBe(1);
  expect(testEvent.judges[0]).toBe(3);

  fireEvent.click(screen.getByText(/Lisää tuomari/i));
  expect(changeHandler).toHaveBeenCalledTimes(2);
  expect(testEvent.judges.length).toBe(2);
  expect(testEvent.judges[1]).toBe(0);

  rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  fireEvent.mouseDown(screen.getByLabelText(/Tuomari 2/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 1/i));

  expect(changeHandler).toHaveBeenCalledTimes(3);
  expect(testEvent.judges[1]).toBe(1);

  rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  const buttons = screen.getAllByText(/Poista Tuomari/i);
  expect(buttons.length).toBe(2);

  fireEvent.click(buttons[1]);

  expect(changeHandler).toHaveBeenCalledTimes(4);
  expect(testEvent.judges.length).toBe(1);
  expect(testEvent.judges[0]).toBe(3);
});

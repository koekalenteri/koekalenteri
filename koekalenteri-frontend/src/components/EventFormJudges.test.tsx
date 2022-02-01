import { fireEvent, render, screen, within } from '@testing-library/react';
import { EventFormJudges } from '.';

const JUDGES = [{
  id: 1,
  name: 'Test Judge 1',
  email: 'joo@ei.com',
  phone: '0700-judge',
  location: 'Pohjois-Karjala',
  languages: ['fi'],
  eventTypes: ['NOWT']
}, {
  id: 2,
  name: 'Test Judge 2',
  email: 'joo2@ei.com',
  phone: '0700-judge2',
  location: 'Pohjois-Karjala',
  languages: ['fi'],
  eventTypes: ['NOWT']
}, {
  id: 3,
  name: 'Test Judge 3',
  email: 'joo3@ei.com',
  phone: '0700-judge3',
  location: 'Pohjois-Karjala',
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
      { class: 'c1' },
      { class: 'c2' },
      { class: 'c3' }
    ]
  };

  const changeHandler = jest.fn((props) => Object.assign(testEvent, props));

  const { rerender } = render(<EventFormJudges event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  fireEvent.mouseDown(screen.getByLabelText(/Ylituomari/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 3/i));

  rerender(<EventFormJudges event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  expect(changeHandler).toHaveBeenCalledTimes(1);
  expect(testEvent.judges.length).toBe(1);
  expect(testEvent.judges[0]).toBe(3);

  fireEvent.click(screen.getByText(/Lisää tuomari/i));
  expect(changeHandler).toHaveBeenCalledTimes(2);
  expect(testEvent.judges.length).toBe(2);
  expect(testEvent.judges[1]).toBe(0);

  rerender(<EventFormJudges event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  fireEvent.mouseDown(screen.getByLabelText(/Tuomari 2/i));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 1/i));

  expect(changeHandler).toHaveBeenCalledTimes(3);
  expect(testEvent.judges[1]).toBe(1);

  rerender(<EventFormJudges event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  const buttons = screen.getAllByText(/Poista Tuomari/i);
  expect(buttons.length).toBe(2);

  fireEvent.click(buttons[1]);

  expect(changeHandler).toHaveBeenCalledTimes(4);
  expect(testEvent.judges.length).toBe(1);
  expect(testEvent.judges[0]).toBe(3);

  rerender(<EventFormJudges event={testEvent} judges={JUDGES} onChange={changeHandler} />);

  fireEvent.click(screen.getByText('c2 01.06'));
  expect(changeHandler).toHaveBeenCalledTimes(5);
  expect(testEvent.classes[1]).toEqual({ class: 'c2', judge: { id: 3, name: 'Test Judge 3' } });
});

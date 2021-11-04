import { render } from '@testing-library/react';
import { EventInfo } from './EventInfo';
import { emptyEvent } from 'koekalenteri-shared/src/test-utils/emptyEvent';


test('It should render event information', async function() {
  const event = {
    ...emptyEvent,
    organizer: {
      id: 0,
      name: 'test organization'
    },
    name: 'name',
    location: 'location',
    startDate: new Date('2021-02-10'),
    endDate: new Date('2021-02-11'),
    entryStartDate: new Date('2021-01-20'),
    entryEndDate: new Date('2021-02-04'),
    description: 'event description text',
    classes: [{
      date: new Date('2021-02-10'),
      class: 'TestClass',
      judge: { id: 1, name: 'Test Judge' },
      places: 11,
      entries: 22,
      members: 2
    }],
    isEntryOpen: false,
    isEntryClosing: false
  };
  const { getByText } = render(<EventInfo event={event} />);

  // organizer
  expect(getByText('test organization')).toBeInTheDocument();

  // title
  expect(getByText('10.-11.2.2021 location (name)')).toBeInTheDocument();

  // entry dates
  expect(getByText('20.1.-4.2.2021')).toBeInTheDocument();

  // classes
  expect(getByText('ke 10.2.')).toBeInTheDocument();
  expect(getByText('TestClass')).toBeInTheDocument();
  expect(getByText('Test Judge')).toBeInTheDocument();
  expect(getByText('22/11 (2)')).toBeInTheDocument();

  // description
  expect(getByText('event description text')).toBeInTheDocument();
});

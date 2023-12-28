import type { PartialEvent } from '../EventForm'

import { fireEvent, render, screen, within } from '@testing-library/react'

import JudgesSection from './JudgesSection'

const JUDGES = [
  {
    id: 1,
    name: 'Test Judge 1',
    email: 'joo@ei.com',
    phone: '+3584011111',
    location: 'Pohjois-Karjala',
    district: 'Pohjois-Karjalan Kennelpiiri ry',
    languages: ['fi'],
    eventTypes: ['NOWT'],
  },
  {
    id: 2,
    name: 'Test Judge 2',
    email: 'joo2@ei.com',
    phone: '+3584022222',
    location: 'Pohjois-Karjala',
    district: 'Pohjois-Karjalan Kennelpiiri ry',
    languages: ['fi'],
    eventTypes: ['NOWT'],
  },
  {
    id: 3,
    name: 'Test Judge 3',
    email: 'joo3@ei.com',
    phone: '+3584033333',
    location: 'Pohjois-Karjala',
    district: 'Pohjois-Karjalan Kennelpiiri ry',
    languages: ['fi'],
    eventTypes: ['NOWT'],
  },
]

describe('JudgeSection', () => {
  it('should render properly with one judge selected', () => {
    const testEvent: PartialEvent = {
      id: 'test',
      judges: [{ id: 1, name: 'Test Judge 1' }],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const { container } = render(<JudgesSection event={testEvent} judges={JUDGES} />)
    expect(container).toMatchSnapshot()
  })

  it('should render properly with two judges selected', () => {
    const testEvent: PartialEvent = {
      id: 'test',
      judges: [
        { id: 1, name: 'Test Judge 1' },
        { id: 2, name: 'Test Judge 2' },
      ],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const { container } = render(<JudgesSection event={testEvent} judges={JUDGES} />)
    expect(container).toMatchSnapshot()
  })

  it('should render properly with three judges selected', () => {
    const testEvent: PartialEvent = {
      id: 'test',
      judges: [
        { id: 1, name: 'Test Judge 1' },
        { id: 2, name: 'Test Judge 2' },
        { id: 3, name: 'Test Judge 3' },
      ],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const { container } = render(<JudgesSection event={testEvent} judges={JUDGES} />)
    expect(container).toMatchSnapshot()
  })

  it('should not warn about judge 0 not beign available (KOE-357)', () => {
    const testEvent: PartialEvent = {
      id: 'test',
      judges: [{ id: 0, name: '' }],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const { container } = render(<JudgesSection event={testEvent} judges={JUDGES} />)
    expect(container).toMatchSnapshot()
  })

  it('should hide classes for NOWT event (KOE-317)', () => {
    const testEvent: PartialEvent = {
      id: 'test',
      eventType: 'NOWT',
      judges: [{ id: 0, name: '' }],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [{ class: 'AVO', date: new Date('2022-06-01') }],
    }
    const { container } = render(<JudgesSection event={testEvent} judges={JUDGES} />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange', async () => {
    const testEvent: PartialEvent = {
      id: 'test',
      judges: [{ id: 1, name: 'Test Judge 1', official: true }],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [
        { class: 'ALO', date: new Date('2022-06-01') },
        { class: 'AVO', date: new Date('2022-06-01') },
        { class: 'VOI', date: new Date('2022-06-01') },
        { class: 'ALO', date: new Date('2022-06-02') },
        { class: 'AVO', date: new Date('2022-06-02') },
        { class: 'VOI', date: new Date('2022-06-02') },
      ],
    }

    const changeHandler = jest.fn((props) => Object.assign(testEvent, props))

    const { rerender } = render(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />)

    fireEvent.mouseDown(screen.getByLabelText('judgeChief'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 3/i))

    rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />)

    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(testEvent.judges.length).toBe(1)
    expect(testEvent.judges[0]).toEqual(expect.objectContaining({ id: 3, name: 'Test Judge 3', official: true }))

    fireEvent.click(screen.getByText(/Lisää tuomari/i))
    expect(changeHandler).toHaveBeenCalledTimes(2)
    expect(testEvent.judges.length).toBe(2)
    expect(testEvent.judges[1]).toEqual(expect.objectContaining({ id: 0, name: '', official: true }))

    rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />)

    fireEvent.mouseDown(screen.getByLabelText('judge 2'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(/Test Judge 1/i))

    expect(changeHandler).toHaveBeenCalledTimes(3)
    expect(testEvent.judges[1]).toEqual(expect.objectContaining({ id: 1, name: 'Test Judge 1', official: true }))

    rerender(<JudgesSection event={testEvent} judges={JUDGES} onChange={changeHandler} />)

    const buttons = screen.getAllByText(/Poista Tuomari/i)
    expect(buttons.length).toBe(2)

    fireEvent.click(buttons[1])

    expect(changeHandler).toHaveBeenCalledTimes(4)
    expect(testEvent.judges.length).toBe(1)
    expect(testEvent.judges[0]).toEqual(expect.objectContaining({ id: 3, name: 'Test Judge 3', official: true }))
  })
})

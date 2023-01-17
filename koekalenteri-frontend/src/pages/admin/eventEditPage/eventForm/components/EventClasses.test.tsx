
import { render } from '@testing-library/react'
import { parseISO } from 'date-fns'

import EventClasses from './EventClasses'

const date = parseISO('2023-01-17')

describe('EventClasses', () => {
  it('should render with minimal properties', () => {
    const { container } = render(<EventClasses id={''} eventStartDate={date} value={undefined} classes={[]} label={''} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with classes', () => {
    const { container } = render(<EventClasses
      id={''}
      eventStartDate={date}
      value={undefined}
      classes={[{class: 'ALO'}, {class: 'AVO'}]}
      label={''}
    />)
    expect(container).toMatchSnapshot()
  })

  it('should render with classes and value', () => {
    const { container } = render(<EventClasses
      id={''}
      eventStartDate={date}
      value={[{class: 'ALO', date, judge: {id: 1, name: 'Test Judge'}}]}
      classes={[{class: 'ALO', date}, {class: 'AVO', date}]}
      label={''} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with classes and values', () => {
    const { container } = render(<EventClasses
      id={''}
      eventStartDate={date}
      value={[
        {class: 'ALO', date, judge: {id: 1, name: 'Test Judge'}},
        {class: 'AVO', date, judge: [{id: 1, name: 'Test Judge'}, {id: 2, name: 'Test Judge2'}]},
      ]}
      classes={[{class: 'ALO', date}, {class: 'AVO', date}]}
      label={''}
      showCount
    />)
    expect(container).toMatchSnapshot()
  })
})

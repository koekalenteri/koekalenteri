import { render } from '@testing-library/react'

import { RegistrationDate } from '../../../koekalenteri-shared/model'

import { GroupColors } from './GroupColors'

describe('GroupColors', () => {

  const dates = [new Date(2020, 1, 1, 12), new Date(2020, 1, 2, 12), new Date(2020, 1, 3, 12)]
  const regDates = dates.reduce<RegistrationDate[]>((acc, date) => [...acc, {date, time: 'ap'}, {date, time: 'ip'}], [])
  const cases: [number, number, Date[], RegistrationDate[]][] = []

  for (let i = 0; i <= dates.length; i++) {
    const d = dates.slice(0, i)
    for (let j = 0; j <= regDates.length && j <= i * 2; j++) {
      cases.push([i, j, d, regDates.slice(0, j)])
    }
  }

  test.each(cases)('given %p dates and %p selected', (_i, _j, d, s) => {
    const { container } = render(<GroupColors dates={d} selected={s} />)
    expect(container).toMatchSnapshot()
  })
})

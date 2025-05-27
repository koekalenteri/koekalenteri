import type { RegistrationDate } from '../../../../types'

import { render } from '@testing-library/react'

import GroupColors, { availableGroups, GROUP_COLORS } from './GroupColors'

describe('GroupColors', () => {
  const dates = [new Date(2020, 1, 1, 12), new Date(2020, 1, 2, 12), new Date(2020, 1, 3, 12)]
  const regDates = dates.reduce<RegistrationDate[]>(
    (acc, date) => [...acc, { date, time: 'ap' }, { date, time: 'ip' }],
    []
  )
  const cases: [number, number, RegistrationDate[], RegistrationDate[]][] = []

  for (let i = 0; i <= dates.length; i++) {
    const d = regDates.slice(0, i)
    for (let j = 0; j <= regDates.length && j <= i * 2; j++) {
      cases.push([i, j, d, regDates.slice(0, j)])
    }
  }

  it.each(cases)('given %p dates and %p selected', (_i, _j, d, s) => {
    const { container } = render(<GroupColors available={d} selected={s} />)

    if (d.length === 0) {
      // When no dates are available, we should just have the tooltip wrapper
      const boxes = container.querySelectorAll('[class*="MuiBox-root"]')
      expect(boxes.length).toBe(0)
      return
    }

    // Get all the color boxes (direct children of the Stack)
    const stack = container.querySelector('[class*="MuiStack-root"]')
    expect(stack).not.toBeNull()

    if (stack) {
      const colorBoxes = stack.querySelectorAll(':scope > [class*="MuiBox-root"]')
      expect(colorBoxes.length).toBe(d.length)

      // Check that selected dates have the correct colors
      d.forEach((date, index) => {
        const isSelected = !!s.find(
          (selected) => selected.date.getTime() === date.date.getTime() && selected.time === date.time
        )

        const box = colorBoxes[index]
        if (isSelected) {
          const expectedColor = GROUP_COLORS[index % GROUP_COLORS.length]
          expect(box).toHaveStyle(`background-color: ${expectedColor}`)
        } else {
          expect(box).toHaveStyle('background-color: transparent')
        }
      })
    }
  })

  it('renders a single color box when disableTooltip is true', () => {
    const available = regDates.slice(0, 3)
    const selected = [available[1]]

    const { container } = render(<GroupColors available={available} selected={selected} disableTooltip={true} />)

    // Should render a single box with the color of the selected date
    const colorBox = container.querySelector('[class*="MuiBox-root"]')
    const selectedIndex = available.findIndex(
      (dt) => selected[0].date.getTime() === dt.date.getTime() && selected[0].time === dt.time
    )
    const expectedColor = GROUP_COLORS[selectedIndex % GROUP_COLORS.length]

    expect(colorBox).toHaveStyle(`background-color: ${expectedColor}`)
  })
})

describe('availableGroups', () => {
  it('works with empty input', () => {
    expect(availableGroups([])).toEqual([])
  })

  it('generates ap and ip for each date', () => {
    const dates = [new Date('2020-02-01T10:00:00.000Z'), new Date('2020-07-08T09:00:00.000Z')]
    const groups = availableGroups(dates)

    expect(groups).toEqual([
      { date: dates[0], time: 'ap' },
      { date: dates[0], time: 'ip' },
      { date: dates[1], time: 'ap' },
      { date: dates[1], time: 'ip' },
    ])

    // Verify the structure of each group
    groups.forEach((group, index) => {
      const dateIndex = Math.floor(index / 2)
      const timeValue = index % 2 === 0 ? 'ap' : 'ip'

      expect(group.date).toBe(dates[dateIndex])
      expect(group.time).toBe(timeValue)
    })
  })
})

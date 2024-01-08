import { render, screen } from '@testing-library/react'

import CostInfo from './CostInfo'

describe('CostInfo', () => {
  it('should render with all the information', () => {
    const { container } = render(<CostInfo event={{ cost: 50, costMember: 40 }} />)
    expect(container).toMatchSnapshot()
    expect(screen.getByText(/event.costMember/)).toBeInTheDocument()
  })

  it('should not render costMember when it is zero', () => {
    const { container } = render(<CostInfo event={{ cost: 50, costMember: 0 }} />)
    expect(container).toMatchSnapshot()
    expect(screen.queryByText(/event.costMember/)).not.toBeInTheDocument()
  })

  it('should not render paymentDefauils when it is empty', () => {
    const { container } = render(<CostInfo event={{ cost: 50, costMember: 0 }} />)
    expect(container).toMatchSnapshot()
  })
})

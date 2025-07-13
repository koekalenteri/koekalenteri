import type { DogEvent } from '../../types'

import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import CostInfo from './CostInfo'

describe('CostInfo', () => {
  const setup = (event: Pick<DogEvent, 'cost' | 'costMember'>) =>
    render(<CostInfo event={event} />, { wrapper: RecoilRoot })

  it('should render with all the information', () => {
    const { container } = setup({ cost: 50, costMember: 40 })
    expect(container).toMatchSnapshot()
    expect(screen.getByText(/event.costMember/)).toBeInTheDocument()
  })

  it('should not render costMember when it is zero', () => {
    const { container } = setup({ cost: 50, costMember: 0 })
    expect(container).toMatchSnapshot()
    expect(screen.queryByText(/event.costMember/)).not.toBeInTheDocument()
  })

  it('should not render paymentDefauils when it is empty', () => {
    const { container } = setup({ cost: 50, costMember: 0 })
    expect(container).toMatchSnapshot()
  })
})

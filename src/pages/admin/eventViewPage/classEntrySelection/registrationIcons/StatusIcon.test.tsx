import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { render, screen } from '@testing-library/react'

import StatusIcon from './StatusIcon'

describe('StatusIcon', () => {
  it('should render with full opacity when condition is true', () => {
    render(<StatusIcon condition={true} icon={<CheckOutlined data-testid="test-icon" />} />)

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle('opacity: 1')
  })

  it('should render with low opacity when condition is false', () => {
    render(<StatusIcon condition={false} icon={<CheckOutlined data-testid="test-icon" />} />)

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle('opacity: 0.05')
  })

  it('should render with full opacity when alwaysShow is true regardless of condition', () => {
    render(<StatusIcon condition={false} alwaysShow={true} icon={<CheckOutlined data-testid="test-icon" />} />)

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle('opacity: 1')
  })

  it('should set fontSize to small', () => {
    render(<StatusIcon condition={true} icon={<CheckOutlined data-testid="test-icon" />} />)

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle('fontSize: "small"')
  })
})

import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { render, screen } from '@testing-library/react'
import StatusIcon from './StatusIcon'

describe('StatusIcon', () => {
  it.each([
    ['full opacity when condition is true', true, false, 1],
    ['low opacity when condition is false', false, false, 0.05],
    ['full opacity when alwaysShow is true', false, true, 1],
  ])('should render with %s', (_description, condition, alwaysShow, opacity) => {
    render(
      <StatusIcon condition={condition} alwaysShow={alwaysShow} icon={<CheckOutlined data-testid="test-icon" />} />
    )

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle(`opacity: ${opacity}`)
  })

  it('should set fontSize to small', () => {
    render(<StatusIcon condition={true} icon={<CheckOutlined data-testid="test-icon" />} />)

    const icon = screen.getByTestId('test-icon')
    expect(icon).toHaveStyle('fontSize: "small"')
  })
})

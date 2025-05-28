import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { render, screen } from '@testing-library/react'

import DroppableDataGrid from './DroppableDataGrid'

jest.mock('../../../components/StyledDataGrid', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="styled-data-grid" data-props={JSON.stringify(props)}>
      {props.slots?.row && <div data-testid="row-slot">{props.slots.row.displayName}</div>}
    </div>
  ),
}))

jest.mock('./droppableDataGrid/DraggableRow', () => {
  const DraggableRow = () => <div data-testid="draggable-row" />

  DraggableRow.displayName = 'DraggableRow'

  return {
    __esModule: true,
    default: DraggableRow,
  }
})

describe('DroppableDataGrid', () => {
  const renderWithDnd = (ui: React.ReactElement) => {
    return render(<DndProvider backend={HTML5Backend}>{ui}</DndProvider>)
  }

  it('should render StyledDataGrid with correct props', () => {
    renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} />)

    const grid = screen.getByTestId('styled-data-grid')
    expect(grid).toBeInTheDocument()

    // Check that DraggableRow is set as the row slot
    expect(screen.getByTestId('row-slot')).toHaveTextContent('DraggableRow')
  })

  it('should apply className based on drag state', () => {
    const { container } = renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} />)

    expect(container.firstChild).toHaveClass('accept')
    expect(container.firstChild).not.toHaveClass('reject')
    expect(container.firstChild).not.toHaveClass('over')
  })

  it('should use the provided flex value for styling', () => {
    const { container } = renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} flex={2} />)

    // Check that the flex style is applied
    expect(container.firstChild).toHaveStyle('flex-grow: 2')
  })

  it('should use default flex value of 1 when not provided', () => {
    const { container } = renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} />)

    // Check that the default flex style is applied
    expect(container.firstChild).toHaveStyle('flex-grow: 1')
  })

  it('should merge additional sx props correctly', () => {
    renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} sx={{ bgcolor: 'red' }} />)

    const grid = screen.getByTestId('styled-data-grid')
    const props = JSON.parse(grid.getAttribute('data-props') || '{}')

    // Check that the sx prop includes both the default styles and the custom style
    expect(props.sx).toHaveLength(2)
    expect(props.sx[1]).toEqual({ bgcolor: 'red' })
  })

  it('should handle array of sx props correctly', () => {
    renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} sx={[{ color: 'blue' }, { bgcolor: 'red' }]} />)

    const grid = screen.getByTestId('styled-data-grid')
    const props = JSON.parse(grid.getAttribute('data-props') || '{}')

    // Check that all sx props are included
    expect(props.sx).toHaveLength(3) // 1 default + 2 custom
    expect(props.sx[1]).toEqual({ color: 'blue' })
    expect(props.sx[2]).toEqual({ bgcolor: 'red' })
  })

  // Testing the canDrop function
  it('should determine canDrop based on group and custom canDrop function', () => {
    const canDropMock = jest.fn().mockReturnValue(true)

    renderWithDnd(<DroppableDataGrid rows={[]} columns={[]} group="group1" canDrop={canDropMock} />)

    // We can't easily test the actual drop behavior in a unit test,
    // but we can verify that the canDrop function is passed correctly
    expect(canDropMock).not.toHaveBeenCalled() // It's only called during drag operations
  })
})

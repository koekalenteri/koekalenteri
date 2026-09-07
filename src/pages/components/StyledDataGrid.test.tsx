import { render, screen } from '@testing-library/react'
import StyledDataGrid from './StyledDataGrid'

const columns = [{ field: 'name', headerName: 'Nimi' }]
const rows = [{ id: 1, name: 'Syyskoe' }]

const Toolbar = () => <div>toolbar contents</div>

describe('StyledDataGrid', () => {
  // Since x-data-grid v8 a toolbar slot is dropped unless showToolbar is set, which silently took the
  // search, the column selector and the pages' own filters off every admin list.
  it('shows the toolbar a page gives it', () => {
    render(<StyledDataGrid columns={columns} rows={rows} slots={{ toolbar: Toolbar }} />)

    expect(screen.getByText('toolbar contents')).toBeInTheDocument()
  })

  it('shows the toolbar when the grid sizes its own page', () => {
    render(<StyledDataGrid autoPageSize columns={columns} rows={rows} slots={{ toolbar: Toolbar }} />)

    expect(screen.getByText('toolbar contents')).toBeInTheDocument()
  })

  it('leaves the toolbar out when a page gives none', () => {
    render(<StyledDataGrid columns={columns} rows={rows} />)

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })
})

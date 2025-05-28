import { screen, waitFor } from '@testing-library/react'

import { renderWithUserEvents } from '../../../../test-utils/utils'

import UnlockArrange from './UnlockArrange'

describe('UnlockArrange', () => {
  it('renders', async () => {
    const { container } = renderWithUserEvents(<UnlockArrange />)
    expect(container).toMatchSnapshot()
  })

  it('renders checked', async () => {
    const { container } = renderWithUserEvents(<UnlockArrange checked />)
    expect(container).toMatchSnapshot()
  })

  it('renders empty when disabled', () => {
    const { container } = renderWithUserEvents(<UnlockArrange disabled />)
    expect(container).toBeEmptyDOMElement()
  })

  it('should render a switch with the correct label', () => {
    renderWithUserEvents(<UnlockArrange checked={false} onChange={jest.fn()} />)

    expect(screen.getByText('Järjestä varasijoja, vaikka varasijailmoitukset on jo lähetetty')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('should render the switch in unchecked state when checked is false', () => {
    renderWithUserEvents(<UnlockArrange checked={false} onChange={jest.fn()} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
  })

  it('should render the switch in checked state when checked is true', () => {
    renderWithUserEvents(<UnlockArrange checked={true} onChange={jest.fn()} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('should call onChange with the new value when clicked', async () => {
    const handleChange = jest.fn()
    const { user } = renderWithUserEvents(<UnlockArrange checked={false} onChange={handleChange} />)

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('should not render the switch when disabled prop is true', () => {
    renderWithUserEvents(<UnlockArrange checked={false} onChange={jest.fn()} disabled={true} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('should not disable the switch when disabled prop is false', () => {
    renderWithUserEvents(<UnlockArrange checked={false} onChange={jest.fn()} disabled={false} />)

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeDisabled()
  })

  it('should show the tooltip when hovering over the info icon', async () => {
    const { user } = renderWithUserEvents(<UnlockArrange checked={false} onChange={jest.fn()} />)

    const infoIcon = screen.getByTestId('InfoOutlinedIcon')
    await user.hover(infoIcon)

    // The tooltip should be visible after hovering
    await waitFor(() => {
      expect(screen.getByText(/Jos varasijojen järjestykseen jäi virhe/i)).toBeInTheDocument()
      expect(screen.getByText(/Käytä varoen/i)).toBeInTheDocument()
    })
  })
})

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AdminLink } from './AdminLink'

const Wrapper = (props: { readonly children?: ReactNode }) => {
  return <MemoryRouter>{props.children}</MemoryRouter>
}
describe('AdminLink', () => {
  it('should render with minimal properties', () => {
    render(<AdminLink />, { wrapper: Wrapper })

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).toHaveAttribute('href', '/admin/event')
  })

  it('should render active border', () => {
    render(<AdminLink active activeBorder="1px solid red" />, { wrapper: Wrapper })

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).toHaveStyle({ borderBottom: '1px solid rgb(255, 0, 0)' })
  })

  it('should not render border when not active', () => {
    render(<AdminLink activeBorder="1px solid red" />, { wrapper: Wrapper })

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).not.toHaveStyle({ borderBottom: '1px solid red' })
  })
})

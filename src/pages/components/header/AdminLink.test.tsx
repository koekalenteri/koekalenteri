import type { ReactNode } from 'react'

import { MemoryRouter } from 'react-router'
import { render, screen } from '@testing-library/react'

import { AdminLink } from './AdminLink'

const Wrapper = (props: { readonly children?: ReactNode }) => {
  return <MemoryRouter>{props.children}</MemoryRouter>
}
describe('AdminLink', () => {
  it('should render with minimal properties', () => {
    const { container } = render(<AdminLink />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).toHaveAttribute('href', '/admin/event')
  })

  it('should render active border', () => {
    const { container } = render(<AdminLink active activeBorder="1px solid red" />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).toHaveStyle({ borderBottom: '1px solid red' })
  })

  it('should not render border when not active', () => {
    const { container } = render(<AdminLink activeBorder="1px solid red" />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()

    const link = screen.getByRole('link', { name: 'admin' })
    expect(link).not.toHaveStyle({ borderBottom: '1px solid red' })
  })
})

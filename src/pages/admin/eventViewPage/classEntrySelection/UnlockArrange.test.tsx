import { render } from '@testing-library/react'

import UnlockArrange from './UnlockArrange'

describe('UnlockArrange', () => {
  it('renders', async () => {
    const { container } = render(<UnlockArrange />)
    expect(container).toMatchSnapshot()
  })
  it('renders checked', async () => {
    const { container } = render(<UnlockArrange checked />)
    expect(container).toMatchSnapshot()
  })
  it('renders empty when disabled', () => {
    const { container } = render(<UnlockArrange disabled />)
    expect(container).toBeEmptyDOMElement()
  })
})

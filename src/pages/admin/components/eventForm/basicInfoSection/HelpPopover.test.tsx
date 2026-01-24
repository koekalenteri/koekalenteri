import { screen } from '@testing-library/react'
import { renderWithUserEvents } from '../../../../../test-utils/utils'
import HelpPopover from './HelpPopover'

describe('HelpPopover', () => {
  const onCloseMock = jest.fn()
  const button = document.createElement('button')

  beforeEach(() => {
    onCloseMock.mockClear()
  })

  test('does not render popover when anchorEl is null', () => {
    renderWithUserEvents(
      <HelpPopover anchorEl={null} onClose={onCloseMock}>
        <div>Help content</div>
      </HelpPopover>
    )
    // The popover content should not be in the document
    expect(screen.queryByText('Help content')).not.toBeInTheDocument()
  })

  test('renders popover when anchorEl is provided', () => {
    renderWithUserEvents(
      <HelpPopover anchorEl={button} onClose={onCloseMock}>
        <div>Help content</div>
      </HelpPopover>
    )
    expect(screen.getByText('Help content')).toBeInTheDocument()
  })

  test('calls onClose when popover requests to close', async () => {
    const { user } = renderWithUserEvents(
      <HelpPopover anchorEl={button} onClose={onCloseMock}>
        <div>Help content</div>
      </HelpPopover>
    )
    // Simulate pressing Escape key to close the popover
    await user.keyboard('{Escape}')
    // onClose should be called
    expect(onCloseMock).toHaveBeenCalled()
  })
})

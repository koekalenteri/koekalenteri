import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import theme from '../../assets/Theme'
import { CollapsibleEvent } from './CollapsibleEvent'

const renderCollapsibleEvent = (cancelled?: boolean) =>
  render(
    <ThemeProvider theme={theme}>
      <Provider>
        <CollapsibleEvent eventId="test-event" header={<span>header</span>} cancelled={cancelled}>
          <span>details</span>
        </CollapsibleEvent>
      </Provider>
    </ThemeProvider>
  )

describe('CollapsibleEvent', () => {
  it('does not dim the row by default', () => {
    renderCollapsibleEvent()

    expect(screen.getByRole('heading').closest('article')).not.toHaveStyle('opacity: 0.6')
  })

  it('dims the row when cancelled', () => {
    renderCollapsibleEvent(true)

    expect(screen.getByRole('heading').closest('article')).toHaveStyle('opacity: 0.6')
  })
})

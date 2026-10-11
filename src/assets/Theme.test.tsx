import { createTheme, responsiveFontSizes, ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { render, screen } from '@testing-library/react'
import theme from './Theme'

// MUI's own scale with the same responsive sizing, as the theme had it before it set heading sizes.
const mui = responsiveFontSizes(createTheme()).typography

const sizeOf = (style: { fontSize?: string | number }) => Number.parseFloat(String(style.fontSize))

describe('Theme', () => {
  describe('heading sizes', () => {
    // A heading takes the level its place in the outline gives it, so the look it had under a
    // smaller level has to move up with it (KOE-1506): a page title stays the size it was, and a
    // section heading at h3 under a dialog's h2 looks as it did when it was an h6.
    it.each([
      ['h1', 'h4'],
      ['h2', 'h5'],
      ['h3', 'h6'],
    ] as const)('sets %s as MUI set %s', (level, look) => {
      expect(theme.typography[level]).toEqual(mui[look])
    })

    it('makes every level smaller than the one above it', () => {
      const sizes = (['h1', 'h2', 'h3', 'h4', 'h5'] as const).map((level) => sizeOf(theme.typography[level]))

      expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
      expect(new Set(sizes).size).toBe(sizes.length)
    })
  })

  // MUI renders a subtitle as an h6, so a column header or a field's label set in subtitle type
  // became a heading that broke the outline: the event form's "Number of trial places" under the
  // details dialog's h2 failed axe's heading-order.
  it.each(['subtitle1', 'subtitle2'] as const)('renders %s as a paragraph rather than a heading', (variant) => {
    render(
      <ThemeProvider theme={theme}>
        <Typography variant={variant}>Label</Typography>
      </ThemeProvider>
    )

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Label').tagName).toBe('P')
  })
})

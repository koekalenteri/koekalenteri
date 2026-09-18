import type { TypographyVariant } from '@mui/material'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { Link } from 'react-router'

interface Props {
  readonly to: string
  /** The words for the way back. Shown where there is room, and the accessible name everywhere. */
  readonly label: string
  /** The heading this sits beside, so the arrow can take the height of that heading's line. */
  readonly headingVariant: TypographyVariant
}

/**
 * The way back out of a screen. One shape wherever a way back is offered, so the secretary looks
 * for it in the same place with the same words.
 *
 * It sits on the heading's row rather than taking one of its own, because what follows a heading
 * here is a list that wants every pixel of height (KOE-541). A row of its own would be given back to
 * the list on a desk and taken from it again on a phone, so on a narrow screen the words are hidden
 * rather than dropped: the arrow beside a title is what a phone reader looks for anyway, and the
 * name is still read aloud.
 *
 * The arrow is centred on that heading's line by taking the heading's own line height and no padding
 * of its own. A button centres its content in its line box, so with both boxes starting at the row's
 * top and standing the same height, the arrow lands on the line — measured within a pixel from 390px
 * to 1400px, with no number in here that a change to the type scale could make stale. The theme
 * scales headings by breakpoint (`responsiveFontSizes`), so a fixed nudge cannot do this: centring
 * asked for 1.1px at 390, 1.6px at 700, 3.6px at 900 and 4.6px at 1200.
 *
 * Only the line height comes from the heading; the words keep their own size and weight, and the
 * arrow its own. The box stays the height of that one line, so it does not push the row taller than
 * the heading needs; the hit area is widened past it with `::after`, which costs no layout.
 */
export function BackLink({ to, label, headingVariant }: Props) {
  return (
    <Button
      component={Link}
      size="small"
      startIcon={<ArrowBack fontSize="small" />}
      sx={{
        '& .MuiButton-startIcon': { mr: { sm: 1, xs: 0 } },
        // A thumb needs more than the arrow, and this way of giving it costs the row no height.
        '&::after': { content: '""', inset: -10, position: 'absolute' },
        minWidth: { sm: 'auto', xs: 0 },
        ml: -1,
        py: 0,
        typography: headingVariant,
      }}
      to={to}
    >
      <Box
        component="span"
        sx={{
          clip: { sm: 'auto', xs: 'rect(0 0 0 0)' },
          clipPath: { sm: 'none', xs: 'inset(50%)' },
          fontSize: (theme) => theme.typography.button.fontSize,
          fontWeight: (theme) => theme.typography.button.fontWeight,
          height: { sm: 'auto', xs: '1px' },
          letterSpacing: (theme) => theme.typography.button.letterSpacing,
          overflow: { sm: 'visible', xs: 'hidden' },
          position: { sm: 'static', xs: 'absolute' },
          whiteSpace: { sm: 'normal', xs: 'nowrap' },
          width: { sm: 'auto', xs: '1px' },
        }}
      >
        {label}
      </Box>
    </Button>
  )
}

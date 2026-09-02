import type { ButtonProps, Theme } from '@mui/material'
import { useMediaQuery } from '@mui/material'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

interface Props extends Readonly<Omit<ButtonProps, 'children'>> {
  readonly text: string
}

export default function AutoButton(props: Readonly<Props>) {
  const sm = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const { text, startIcon, endIcon, ...rest } = props

  if (sm) {
    return (
      // The buttons share the row evenly, and the caption wraps at its spaces rather than being cut
      // off at a fixed width; a size small enough that the longest one-word caption still fits a phone.
      <Stack sx={{ alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
        <IconButton color="primary" {...rest}>
          {startIcon ?? endIcon}
        </IconButton>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.625rem',
            letterSpacing: 0,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
            textAlign: 'center',
          }}
        >
          {text}
        </Typography>
      </Stack>
    )
  }
  return (
    <Button color="primary" {...rest} startIcon={startIcon} endIcon={endIcon}>
      {text}
    </Button>
  )
}

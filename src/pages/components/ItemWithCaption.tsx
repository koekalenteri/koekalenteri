import type { GridProps } from '@mui/material'
import type { PropsWithChildren } from 'react'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

interface Props {
  label: string
}

export const ItemWithCaption = ({ label, children, ...gridProps }: PropsWithChildren<Props> & GridProps) => (
  <Grid
    size={{
      lg: 4,
      md: 6,
      xl: 2,
      xs: 12,
    }}
    {...gridProps}
  >
    <Typography
      variant="caption"
      color="text.secondary"
      bgcolor="background.caption"
      borderRadius="4px"
      sx={{ display: 'block', pt: 0.5, width: '100%' }}
      component="div"
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ ml: 0.5 }} component="div">
      {children}
    </Typography>
  </Grid>
)

import type { Grid2Props } from '@mui/material'
import type { PropsWithChildren } from 'react'

import { Grid2 } from '@mui/material'
import Typography from '@mui/material/Typography'

interface Props {
  label: string
}

export const ItemWithCaption = ({ label, children, ...gridProps }: PropsWithChildren<Props> & Grid2Props) => (
  <Grid2
    size={{
      xs: 12,
      md: 6,
      lg: 4,
      xl: 2,
    }}
    {...gridProps}
  >
    <Typography
      variant="caption"
      color="text.secondary"
      bgcolor="background.caption"
      borderRadius="4px"
      sx={{ pt: 0.5, width: '100%', display: 'block' }}
      component="div"
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ ml: 0.5 }} component="div">
      {children}
    </Typography>
  </Grid2>
)

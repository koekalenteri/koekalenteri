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
      bgcolor="background.form"
      borderRadius="4px"
      sx={{ p: 0.5, ml: -0.5, width: '100%', display: 'block' }}
      component="div"
    >
      {label}
    </Typography>
    {children}
  </Grid2>
)

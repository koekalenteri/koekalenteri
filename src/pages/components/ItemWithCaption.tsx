import type { GridProps } from '@mui/material'
import type { PropsWithChildren } from 'react'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

interface Props {
  label: string
  order?: Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number | undefined>>
}

export const ItemWithCaption = ({ label, order, children, ...gridProps }: PropsWithChildren<Props> & GridProps) => (
  <Grid
    size={{
      lg: 4,
      md: 6,
      xl: 2,
      xs: 12,
    }}
    sx={{ order }}
    {...gridProps}
  >
    <Typography
      variant="caption"
      component="div"
      sx={{
        bgcolor: 'background.caption',
        borderRadius: '4px',
        color: 'text.secondary',
        display: 'block',
        pt: 0.5,
        width: '100%',
      }}
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ ml: 0.5 }} component="div">
      {children}
    </Typography>
  </Grid>
)

import type { PropsWithChildren } from 'react'

import Grid2 from '@mui/material/Grid2'

const InfoTableContainerGrid = ({ children }: PropsWithChildren) => (
  <Grid2 container size="auto" mr={1}>
    {children}
  </Grid2>
)

export default InfoTableContainerGrid

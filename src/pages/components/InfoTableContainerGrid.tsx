import type { PropsWithChildren } from 'react'
import Grid from '@mui/material/Grid'

const InfoTableContainerGrid = ({ children }: PropsWithChildren) => (
  <Grid container size="auto" mr={1}>
    {children}
  </Grid>
)

export default InfoTableContainerGrid

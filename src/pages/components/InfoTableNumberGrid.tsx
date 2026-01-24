import { styled } from '@mui/material'
import Grid from '@mui/material/Grid'

const InfoTableNumberGrid = styled(Grid)(({ theme }) => ({
  ...theme.typography.body2,
  paddingRight: 4,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}))

export default InfoTableNumberGrid

import { styled } from '@mui/material'
import Grid2 from '@mui/material/Grid2'

const InfoTableNumberGrid = styled(Grid2)(({ theme }) => ({
  ...theme.typography.body2,
  paddingRight: 4,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}))

export default InfoTableNumberGrid

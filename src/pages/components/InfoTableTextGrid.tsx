import { styled } from '@mui/material'
import Grid2 from '@mui/material/Grid2'

const InfoTableTextGrid = styled(Grid2)(({ theme }) => ({
  ...theme.typography.body2,
  paddingLeft: 4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}))

export default InfoTableTextGrid

import { styled } from '@mui/material'
import Grid from '@mui/material/Grid'

const InfoTableTextGrid = styled(Grid)(({ theme }) => ({
  ...theme.typography.body2,
  overflow: 'hidden',
  paddingLeft: 4,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}))

export default InfoTableTextGrid

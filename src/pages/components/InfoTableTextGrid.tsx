import { styled } from '@mui/material'
import Grid from '@mui/material/Grid'

const InfoTableTextGrid = styled(Grid)(({ theme }) => ({
  ...theme.typography.body2,
  paddingLeft: 4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}))

export default InfoTableTextGrid

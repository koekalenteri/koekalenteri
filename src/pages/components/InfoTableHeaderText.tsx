import type { TypographyProps } from '@mui/material'
import { styled } from '@mui/material'
import Typography from '@mui/material/Typography'

const Caption = (props: TypographyProps) => <Typography {...props} variant="caption" />

const InfoTableHeaderText = styled(Caption)({
  borderBottom: '1px solid #ddd',
  display: 'block',
  fontStyle: 'italic',
  overflow: 'hidden',
  paddingBottom: 0,
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 0,
  textOverflow: 'clip',
  // backgroundColor: theme.palette.background.tableHead,
  textWrap: 'nowrap',
  width: '100%',
})

export default InfoTableHeaderText

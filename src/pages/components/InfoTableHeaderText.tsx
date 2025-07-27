import type { TypographyProps } from '@mui/material'

import { styled } from '@mui/material'
import Typography from '@mui/material/Typography'

const Caption = (props: TypographyProps) => <Typography {...props} variant="caption" />

const InfoTableHeaderText = styled(Caption)({
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 0,
  paddingBottom: 0,
  width: '100%',
  display: 'block',
  // backgroundColor: theme.palette.background.tableHead,
  textWrap: 'nowrap',
  textOverflow: 'clip',
  overflow: 'hidden',
  fontStyle: 'italic',
  borderBottom: '1px solid #ddd',
})

export default InfoTableHeaderText

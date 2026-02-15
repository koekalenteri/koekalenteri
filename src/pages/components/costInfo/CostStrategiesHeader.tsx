import Grid from '@mui/material/Grid'
import InfoTableHeaderText from '../InfoTableHeaderText'

interface Props {
  text: string
}

const CostInfoTableCaption = ({ text }: Props) => (
  <Grid container mr={1} mt={1}>
    <Grid size={{ xs: 12 }}>
      <InfoTableHeaderText>{text}</InfoTableHeaderText>
    </Grid>
  </Grid>
)

export default CostInfoTableCaption

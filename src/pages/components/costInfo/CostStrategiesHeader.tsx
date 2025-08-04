import Grid2 from '@mui/material/Grid2'

import InfoTableHeaderText from '../InfoTableHeaderText'

interface Props {
  text: string
}

const CostInfoTableCaption = ({ text }: Props) => (
  <Grid2 container mr={1} mt={1}>
    <Grid2 size={{ xs: 12 }}>
      <InfoTableHeaderText>{text}</InfoTableHeaderText>
    </Grid2>
  </Grid2>
)

export default CostInfoTableCaption

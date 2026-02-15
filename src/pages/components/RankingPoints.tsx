import Avatar from '@mui/material/Avatar'

interface Props {
  points?: number
}

const RankingPoints = ({ points }: Props) => (
  <Avatar
    sx={{
      bgcolor: 'secondary.dark',
      display: points ? undefined : 'none',
      fontSize: '0.8rem',
      height: 20,
      width: 20,
    }}
    variant="rounded"
  >
    {points}
  </Avatar>
)

export default RankingPoints

import Avatar from '@mui/material/Avatar'

interface Props {
  points?: number
}

const RankingPoints = ({ points }: Props) => (
  <Avatar
    sx={{
      width: 24,
      height: 20,
      bgcolor: 'secondary.dark',
      fontSize: '0.9rem',
      display: points ? undefined : 'none',
    }}
    variant="rounded"
  >
    {points}
  </Avatar>
)

export default RankingPoints

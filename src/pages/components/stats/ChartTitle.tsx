import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

interface Props {
  readonly title: string
  readonly info?: string
}

export default function ChartTitle({ title, info }: Props) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Typography variant="h6">{title}</Typography>
      {info ? (
        <Tooltip title={info} enterTouchDelay={0}>
          <IconButton aria-label={info} size="small">
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  )
}

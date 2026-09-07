import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

interface Props {
  readonly title: string
  readonly info?: string
  readonly filters?: readonly string[]
}

/**
 * The filter values a chart is drawn for, appended to its title:
 * "Osallistujamäärä suhteessa paikkoihin – Auran Nuuskut ry – NOME-B – ALO".
 *
 * The pickers scroll out of sight above the charts, so a bare title leaves the reader guessing
 * what is being counted. A filter left at "all" narrows nothing, and the caller leaves it out.
 */
const titleWithFilters = (title: string, filters?: readonly string[]): string =>
  filters?.length ? [title, ...filters].join(' – ') : title

export default function ChartTitle({ title, info, filters }: Props) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: 'center',
      }}
    >
      <Typography variant="h6">{titleWithFilters(title, filters)}</Typography>
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

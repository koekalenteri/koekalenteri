import type { TeamCompetition, TeamSeries } from '@/types'
import Add from '@mui/icons-material/Add'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/types'

interface Props {
  readonly teamCompetition?: TeamCompetition
  /** The settings as edited, and the series removed, whose teams leave them. */
  readonly onChange: (teamCompetition: TeamCompetition, removedSeriesId?: string) => void
}

/** The settings with these series: none left is no series at all, not an empty list. */
const withSeries = (teamCompetition: TeamCompetition | undefined, series: TeamSeries[]): TeamCompetition => {
  const { series: _series, ...rest } = teamCompetition ?? {}
  return series.length ? { ...rest, series } : rest
}

/**
 * The settings of the event's team competition (KOE-1720): its series, each with its name in Finnish,
 * which every series needs, and in the other languages where the organizer gives one. The teams are
 * ranked within their series, and the public start list heads each with its name.
 */
export default function TeamCompetitionSettings({ teamCompetition, onChange }: Props) {
  const { t } = useTranslation()
  const series = teamCompetition?.series ?? []

  const rename = (id: string, language: (typeof LANGUAGES)[number], text: string) =>
    onChange(
      withSeries(
        teamCompetition,
        series.map((item) => {
          if (item.id !== id) return item
          const { [language]: _old, ...name } = item.name
          return { ...item, name: text ? { ...name, [language]: text } : name }
        })
      )
    )

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h6" component="h2">
          {t('teams.series')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('teams.seriesInfo')}
        </Typography>
        {series.map((item) => (
          <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start', pt: 1 }}>
            {LANGUAGES.map((language) => {
              const missing = language === 'fi' && !item.name.fi?.trim()
              return (
                <TextField
                  key={language}
                  error={missing}
                  helperText={missing ? t('teams.seriesNameRequired') : undefined}
                  label={t('teams.seriesName', { language: t(`language.${language}`) })}
                  onChange={(e) => rename(item.id, language, e.target.value)}
                  size="small"
                  value={item.name[language] ?? ''}
                />
              )
            })}
            <IconButton
              aria-label={t('teams.removeSeries', { name: item.name.fi ?? '' })}
              onClick={() =>
                onChange(
                  withSeries(
                    teamCompetition,
                    series.filter(({ id }) => id !== item.id)
                  ),
                  item.id
                )
              }
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <div>
          <Button
            startIcon={<Add />}
            onClick={() => onChange(withSeries(teamCompetition, [...series, { id: nanoid(8), name: {} }]))}
            size="small"
          >
            {t('teams.addSeries')}
          </Button>
        </div>
      </Stack>
    </Paper>
  )
}

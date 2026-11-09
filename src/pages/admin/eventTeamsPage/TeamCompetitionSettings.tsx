import type { DayKey, TeamCompetition, TeamSeries } from '@/types'
import Add from '@mui/icons-material/Add'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { nanoid } from 'nanoid'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/types'

interface Props {
  readonly teamCompetition?: TeamCompetition
  /** The trial's days, in order: a trial of two or more may count only some (KOE-1726). */
  readonly trialDays: readonly DayKey[]
  /** The settings as edited, and the series removed, whose teams leave them. */
  readonly onChange: (teamCompetition: TeamCompetition, removedSeriesId?: string) => void
}

/** The settings with these series: none left is no series at all, not an empty list. */
const withSeries = (teamCompetition: TeamCompetition | undefined, series: TeamSeries[]): TeamCompetition => {
  const { series: _series, ...rest } = teamCompetition ?? {}
  return series.length ? { ...rest, series } : rest
}

/**
 * The settings counting these days (KOE-1726): every day is no choice at all, not a list of them all, so
 * a day the trial gains later counts too.
 */
const withDays = (
  teamCompetition: TeamCompetition | undefined,
  days: readonly DayKey[],
  trialDays: readonly DayKey[]
): TeamCompetition => {
  const { days: _days, ...rest } = teamCompetition ?? {}
  return days.length < trialDays.length ? { ...rest, days: trialDays.filter((day) => days.includes(day)) } : rest
}

/** The settings asking for the team at entry or not (KOE-1721): not asking is no setting at all. */
const withAskAtEntry = (teamCompetition: TeamCompetition | undefined, ask: boolean): TeamCompetition => {
  const { askAtEntry: _askAtEntry, ...rest } = teamCompetition ?? {}
  return ask ? { ...rest, askAtEntry: true } : rest
}

/** A part of the settings, one level under the panel's heading. */
const SectionHeading = ({ children, id }: { readonly children: string; readonly id?: string }) => (
  <Typography id={id} variant="subtitle1" component="h3" sx={{ fontWeight: 500 }}>
    {children}
  </Typography>
)

interface CountedDaysProps {
  readonly teamCompetition?: TeamCompetition
  readonly trialDays: readonly DayKey[]
  readonly onChange: (teamCompetition: TeamCompetition) => void
}

/**
 * The days whose results the teams count (KOE-1726), one box a day, every day until the secretary leaves
 * one out. The last day counted cannot be left out, as a choice of none would count nothing.
 */
const CountedDays = ({ teamCompetition, trialDays, onChange }: CountedDaysProps) => {
  const { t } = useTranslation()
  const headingId = useId()
  const chosen = (teamCompetition?.days ?? []).filter((day) => trialDays.includes(day))
  const counted = chosen.length ? chosen : trialDays

  return (
    <Stack spacing={1}>
      <SectionHeading id={headingId}>{t('teams.countedDays')}</SectionHeading>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('teams.countedDaysInfo')}
      </Typography>
      <FormGroup aria-labelledby={headingId} role="group" row>
        {trialDays.map((day) => {
          const checked = counted.includes(day)
          return (
            <FormControlLabel
              key={day}
              control={
                <Checkbox
                  checked={checked}
                  disabled={checked && counted.length === 1}
                  onChange={() =>
                    onChange(
                      withDays(
                        teamCompetition,
                        checked ? counted.filter((item) => item !== day) : [...counted, day],
                        trialDays
                      )
                    )
                  }
                  size="small"
                />
              }
              label={t('dateFormat.wdshort', { date: day })}
            />
          )
        })}
      </FormGroup>
    </Stack>
  )
}

/**
 * The settings of the event's team competition: whether the entry form asks for the dog's team
 * (KOE-1721), which the secretary sets before any team is made, and its series (KOE-1720), each with
 * its name in Finnish, which every series needs, and in the other languages where the organizer gives
 * one. The teams are ranked within their series, and the public start list heads each with its name. A
 * trial of two days or more also chooses the days the teams count (KOE-1726).
 */
export default function TeamCompetitionSettings({ teamCompetition, trialDays, onChange }: Props) {
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
          {t('teams.settings')}
        </Typography>
        <SectionHeading>{t('teams.entry')}</SectionHeading>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('teams.entryInfo')}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={!!teamCompetition?.askAtEntry}
              onChange={(e) => onChange(withAskAtEntry(teamCompetition, e.target.checked))}
              size="small"
            />
          }
          label={t('teams.askAtEntry')}
        />
        <Divider />
        <SectionHeading>{t('teams.series')}</SectionHeading>
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
        {trialDays.length > 1 && (
          <>
            <Divider />
            <CountedDays teamCompetition={teamCompetition} trialDays={trialDays} onChange={onChange} />
          </>
        )}
      </Stack>
    </Paper>
  )
}

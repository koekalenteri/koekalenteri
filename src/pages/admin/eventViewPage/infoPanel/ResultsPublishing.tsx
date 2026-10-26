import type { PublishBlocker, ResultsParticipant } from '@/lib/publishing'
import type { ClassOrNone, ConfirmedEvent, DayKey } from '@/types'
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import PlaceOutlined from '@mui/icons-material/PlaceOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useConfirm } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { refusalCode } from '@/api/http'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { dayStart, TIME_ZONE } from '@/lib/day'
import { getClassDays, isResultsPublishedForDay, uniqueClasses } from '@/lib/event'
import { getResultsBlocker } from '@/lib/publishing'
import { scoresAtPosts } from '@/lib/results'
import { Path } from '@/routeConfig'
import { PublishingSection } from './PublishingSection'
import { actionButtonSx } from './styles'

interface Props {
  readonly event: ConfirmedEvent
  /** Results can only be entered once there is something to score. */
  readonly eventStarted?: boolean
  /**
   * Passed in rather than taken from the action hook here: that hook reads an async atom, and reading
   * it during this render suspends the whole panel on a click.
   */
  readonly onSetResultsPublished?: (eventClass: ClassOrNone, date: string, published: boolean) => Promise<unknown>
  /** The participants of each class, a classless event's under its type: whose results there are to publish. */
  readonly selectedByClass: Readonly<Record<string, readonly ResultsParticipant[]>>
}

interface ResultsRow {
  /** The class, or the event type for a classless event. */
  readonly name: string
  /** The class the publish request is for; undefined for the classless event. */
  readonly eventClass: ClassOrNone
  /** The day the row publishes (KOE-1510). */
  readonly day: DayKey
  /** Whether the trial runs on several days, so the row names its day. */
  readonly multiDay: boolean
}

/**
 * One row per class and day, or per day of the whole event where it has no classes (NOU, NOME-A): a
 * classless event publishes its results as one scope, and without a row it had no button at all
 * (KOE-1464). Each day of a class is published on its own, so a second day's results stay off the web
 * while they are being entered (KOE-1510).
 */
const getResultsRows = (event: ConfirmedEvent): ResultsRow[] => {
  const classes = uniqueClasses(event)
  const multiDay = getClassDays(event).length > 1
  const rows = classes.length
    ? classes.map((eventClass) => ({ eventClass, name: eventClass }))
    : [{ eventClass: undefined, name: event.eventType }]
  return rows.flatMap((row) => getClassDays(event, row.eventClass).map((day) => ({ ...row, day, multiDay })))
}

/** A row's own key: its class, or the event type, and its day. */
const rowKey = ({ day, name }: ResultsRow) => `${name}/${day}`

type ResultsMessage = 'confirm' | 'hidden' | 'publishedSnack'

/**
 * What a row waiting to be published says stands in its way, where it is something the secretary can
 * do: publish the start list, or enter a result (KOE-1642). Rather than leaving a dead button.
 */
const BLOCKER_CAPTIONS: Partial<Record<PublishBlocker, 'startListRequired' | 'noResults'>> = {
  results: 'noResults',
  startList: 'startListRequired',
}

/** A confirmation or a notice, for a class or the whole event, naming the day on a multi-day trial. */
const messageKey = (message: ResultsMessage, eventClass: ClassOrNone, withDay: boolean) => {
  const subject = eventClass ? message : (`${message}Event` as const)
  return `eventManagement.results.${subject}${withDay ? 'Day' : ''}` as const
}

/**
 * Publishing results, per class — and the entry that feeds it (KOE-1354).
 *
 * Saving, publishing and sending to Omakoira are three different things, and the ticket is emphatic
 * that they must read that way. Entering a score changes nothing outside this office; publishing is
 * what puts it in front of the public; Omakoira is somewhere else entirely and this does not touch it.
 *
 * The entry sits under the buttons its scores feed, the way the draw entry sits under the start
 * numbers it fills (KOE-1297): a step of the trial reads as one section, not as a decision here and
 * its own doing among the general actions at the foot of the panel.
 */
const ResultsPublishing = ({ event, eventStarted, onSetResultsPublished, selectedByClass }: Props) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const rows = getResultsRows(event)

  const dayLabel = useCallback((day: DayKey) => t('dateFormat.wdshort', { date: dayStart(day, TIME_ZONE) }), [t])
  // The rows whose request is on its way: a second click would only race the first (KOE-1510).
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set())
  const markInFlight = useCallback((key: string, pending: boolean) => {
    setInFlight((current) => {
      const next = new Set(current)
      if (pending) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const toggle = useCallback(
    async (row: ResultsRow, published: boolean) => {
      const { day, eventClass, multiDay } = row
      const params = { day: dayLabel(day), eventClass }
      if (published) {
        // Publishing is the step that cannot be quietly undone in the reader's mind, so it is asked for.
        const { confirmed } = await confirm({
          confirmationText: t('eventManagement.results.publish'),
          description: t(messageKey('confirm', eventClass, multiDay), params),
          title: t('eventManagement.results.confirmTitle'),
        })
        if (!confirmed) return
      }

      markInFlight(rowKey(row), true)
      try {
        await onSetResultsPublished?.(eventClass, day, published)
        const notice = messageKey(published ? 'publishedSnack' : 'hidden', eventClass, multiDay)
        enqueueSnackbar(t(notice, params), { variant: 'success' })
      } catch (error) {
        // Another publish of the same results kept landing first; the server gave up retrying (KOE-1510).
        const changed = refusalCode(error) === 'resultsPublishedChanged'
        enqueueSnackbar(
          t(changed ? 'eventManagement.results.changedMeanwhile' : 'eventManagement.results.saveFailed'),
          errorSnackbarOptions
        )
      } finally {
        markInFlight(rowKey(row), false)
      }
    },
    [confirm, dayLabel, markInFlight, onSetResultsPublished, t]
  )

  return (
    <PublishingSection
      title={t('eventManagement.results.title')}
      action={
        <Stack spacing={1}>
          {/* Where the scoring happens at posts, defining them is the first half of entering results. */}
          {scoresAtPosts(event.eventType) && (
            <Button
              fullWidth
              href={Path.admin.stations(event.id)}
              startIcon={<PlaceOutlined />}
              sx={actionButtonSx}
              variant="outlined"
            >
              {t('eventManagement.stations')}
            </Button>
          )}
          <Button
            disabled={!eventStarted}
            fullWidth
            href={Path.admin.results(event.id)}
            startIcon={<EditNoteOutlined />}
            sx={actionButtonSx}
            variant="outlined"
          >
            {t('eventManagement.enterResults')}
          </Button>
        </Stack>
      }
    >
      {rows.map((row) => {
        const { day, eventClass, multiDay, name } = row
        const published = isResultsPublishedForDay(event, eventClass, day)
        // The same rules the server holds a publish of this day to (KOE-1466, KOE-1510, KOE-1642);
        // hiding is always allowed.
        const blocker = published ? undefined : getResultsBlocker(event, eventClass, selectedByClass[name] ?? [], day)
        const caption = blocker && BLOCKER_CAPTIONS[blocker]

        return (
          <TableRow key={rowKey(row)}>
            <TableCell align="left">
              <Box
                sx={{
                  ml: 2,
                }}
              >
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    fontWeight: 'bold',
                  }}
                >
                  {multiDay ? `${name} ${dayLabel(day)}` : name}
                </Typography>
                {published && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'info.main',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.results.published')}
                  </Typography>
                )}
                {caption && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                    }}
                  >
                    {t(`eventManagement.results.${caption}`)}
                  </Typography>
                )}
              </Box>
            </TableCell>
            <TableCell align="right">
              <Button
                color={published ? 'secondary' : 'primary'}
                disabled={!!blocker || inFlight.has(rowKey(row))}
                onClick={() => toggle(row, !published)}
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
                variant={blocker ? 'outlined' : 'contained'}
              >
                {published ? t('eventManagement.results.hide') : t('eventManagement.results.publish')}
              </Button>
            </TableCell>
          </TableRow>
        )
      })}
    </PublishingSection>
  )
}

export default ResultsPublishing

import type { TFunction } from 'i18next'
import type useAdminEventRegistrationInfo from '@/hooks/useAdminEventRegistrationsInfo'
import type { PublishedStartNumbersSlot, StartNumbersTime } from '@/lib/event'
import type { ConfirmedEvent, RegistrationClass } from '@/types'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { zonedParseDate } from '@/i18n/dates'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { refusalCode } from '@/lib/client/startNumberErrors'
import {
  getPublishedStartNumbersSlots,
  getStartNumbersClassDays,
  getStartNumbersDayTimes,
  isStartNumbersPublishedForDay,
  isStartNumbersPublishedForSlot,
} from '@/lib/event'
import { Path } from '@/routeConfig'
import { PublishingSection } from './PublishingSection'
import { getPublishingRows, isStartNumbersPublished } from './publishingRow'
import { actionButtonSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartNumbersAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) {
    return published ? 'audit.messages.classStartNumbersPublished' : 'audit.messages.classStartNumbersHidden'
  }
  return published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden'
}

/** The confirmation for a numbers publish or hide; a day's own names the day (KOE-1304), or the half of it. */
const startNumbersMessage = (
  t: TFunction,
  eventClass: RegistrationClass | undefined,
  published: boolean,
  day?: string
) => {
  if (!day) return t(getStartNumbersAuditMessageKey(eventClass, published), { eventClass })
  if (eventClass) {
    return t(published ? 'audit.messages.classStartNumbersPublishedDay' : 'audit.messages.classStartNumbersHiddenDay', {
      day,
      eventClass,
    })
  }
  return t(published ? 'audit.messages.startNumbersPublishedDay' : 'audit.messages.startNumbersHiddenDay', { day })
}

interface ClassDay {
  date: Date
  key: string
}

/** The days a class runs, one per class entry — or the event's own days where it has no classes. */
const classDays = (event: ConfirmedEvent, className: string): ClassDay[] =>
  getStartNumbersClassDays(event, event.classes.length ? className : undefined).map((key) => ({
    date: zonedParseDate(key),
    key,
  }))

/**
 * What one button publishes: the whole class (no day), one day of a multi-day class (KOE-1304), or
 * one half of a day the trial draws in two (KOE-1430). The half's button stands beside the day's —
 * or beside the class's, where the class runs one day — so a trial that draws the day at once still
 * publishes it with one press.
 */
interface PublishScope {
  day?: ClassDay
  time?: StartNumbersTime
}

const publishScopes = (days: ClassDay[], dayTimes: (day: ClassDay) => StartNumbersTime[]): PublishScope[] =>
  days.flatMap((day) => [{ day: days.length > 1 ? day : undefined }, ...dayTimes(day).map((time) => ({ day, time }))])

/**
 * How a scope is named on its button and in its confirmation: the day as its weekday, a half by its
 * time — with the day where the class runs several, on its own where it runs one.
 */
const scopeLabel = (t: TFunction, { date, time }: { date: Date; time?: StartNumbersTime }, withDay: boolean) => {
  const day = t('dateFormat.wdshort', { date })
  if (!time) return day
  return withDay ? `${day} ${t(`registration.time.${time}`)}` : t(`registration.timeLong.${time}`)
}

interface Props {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onSetStartNumbersPublished?: (
    eventClass: RegistrationClass | undefined,
    published: boolean,
    date?: string,
    time?: StartNumbersTime
  ) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

/**
 * Publishing the start numbers, per class, per day of a multi-day class (KOE-1304), and per half of a
 * day whose morning and afternoon are drawn apart (KOE-1430).
 *
 * Its own section rather than a corner of the start list's: the panel's steps are one section each,
 * and the numbers are a step of their own that the secretary reaches on the morning of the trial,
 * long after the list went out (KOE-1297). The draw entry sits here too, with the buttons its numbers
 * feed. The preview stays with the start list: the numbers ride on that list and are a column of it,
 * so there is nothing separate to preview.
 */
const StartNumbersPublishing = ({
  event,
  eventWithCurrentAttachments,
  numbersByClass,
  onSetStartNumbersPublished,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()

  const handleSetStartNumbersPublished = async (
    eventClass: RegistrationClass | undefined,
    published: boolean,
    { day, time }: PublishScope,
    withDay: boolean
  ) => {
    if (!onSetStartNumbersPublished) return

    try {
      await onSetStartNumbersPublished(eventClass, published, day?.key, time)
      const scopeText = day ? scopeLabel(t, { date: day.date, time }, withDay) : undefined
      enqueueSnackbar(startNumbersMessage(t, eventClass, published, scopeText), { variant: 'success' })
    } catch (error) {
      // A half-entered draw is the secretary's own next step, not a save failure — name it (KOE-1218).
      const incomplete = refusalCode(error) === 'startNumbersIncomplete'
      enqueueSnackbar(
        t(incomplete ? 'eventManagement.startList.numbersIncomplete' : 'eventManagement.startList.saveFailed'),
        errorSnackbarOptions
      )
    }
  }

  const rows = getPublishingRows({ event, eventWithCurrentAttachments, selectedByClass, stateByClass }, numbersByClass)

  return (
    <PublishingSection
      title={t('eventManagement.startList.numbersPublishing')}
      action={
        /* The draw entry lives with the publish/hide buttons its numbers feed (KOE-1274). */
        <Button
          fullWidth
          href={Path.admin.startNumbers(event.id)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          variant="outlined"
        >
          {t('eventManagement.enterStartNumbers')}
        </Button>
      }
    >
      {rows.map((row) => {
        const { className, publishable, startListEventClass, startListPublished } = row
        const numbersPublished = isStartNumbersPublished(event, row.eventClass)
        // Numbers can only be public on a published list, so the buttons wait for the list.
        const canManageStartNumbers =
          Boolean(onSetStartNumbersPublished) && row.manageable && row.invitationsSent && startListPublished
        const days = classDays(event, className)
        const multiDay = days.length > 1
        const published: PublishedStartNumbersSlot[] = startListPublished
          ? getPublishedStartNumbersSlots(event, startListEventClass)
          : []
        const partlyPublished = !numbersPublished && published.length > 0
        // The halves come from the dogs placed on the day: a day nobody runs in two has no halves.
        const participants = selectedByClass[className] ?? []
        const scopes = publishScopes(days, (day) => getStartNumbersDayTimes(participants, day.key))

        return (
          <TableRow key={className}>
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
                  {className}
                </Typography>
                {numbersPublished && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'info.main',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.startList.numbersPublished')}
                  </Typography>
                )}
                {partlyPublished && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'info.main',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.startList.numbersPublishedDays', {
                      days: published
                        .map((slot) => scopeLabel(t, { date: zonedParseDate(slot.date), time: slot.time }, true))
                        .join(', '),
                    })}
                  </Typography>
                )}
                {/* The list is the numbers' only transport, so say why the buttons are dead. */}
                {!startListPublished && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.results.startListRequired')}
                  </Typography>
                )}
              </Box>
            </TableCell>
            <TableCell align="right">
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                {scopes.map((scope) => {
                  // One button per day of a multi-day class, the whole class otherwise — and one per
                  // half of a day that is drawn in two.
                  const { day, time } = scope
                  let scopePublished = numbersPublished
                  if (day && time) {
                    scopePublished =
                      startListPublished && isStartNumbersPublishedForSlot(event, startListEventClass, day.date, time)
                  } else if (day) {
                    scopePublished =
                      startListPublished && isStartNumbersPublishedForDay(event, startListEventClass, day.date)
                  }
                  const dayLabelKey = scopePublished
                    ? 'eventManagement.startList.hideNumbersDay'
                    : 'eventManagement.startList.publishNumbersDay'
                  const classLabelKey = scopePublished
                    ? 'eventManagement.startList.hideNumbers'
                    : 'eventManagement.startList.publishNumbers'
                  const label = day
                    ? t(dayLabelKey, { day: scopeLabel(t, { date: day.date, time }, multiDay) })
                    : t(classLabelKey)

                  return (
                    <Button
                      key={day ? `${day.key}/${time ?? 'day'}` : 'all'}
                      size="small"
                      disabled={!canManageStartNumbers}
                      onClick={() => {
                        if (publishable) {
                          handleSetStartNumbersPublished(startListEventClass, !scopePublished, scope, multiDay)
                        }
                      }}
                      color={scopePublished ? 'secondary' : 'primary'}
                      // A day never splits from its verb; when the row is short the whole button wraps.
                      sx={{ whiteSpace: 'nowrap' }}
                      variant={canManageStartNumbers ? 'contained' : 'outlined'}
                    >
                      {label}
                    </Button>
                  )
                })}
              </Stack>
            </TableCell>
          </TableRow>
        )
      })}
    </PublishingSection>
  )
}

export default StartNumbersPublishing

import type { TFunction } from 'i18next'
import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { APIError } from '../../../../api/http'
import { zonedParseDate } from '../../../../i18n/dates'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import {
  getPublishedStartNumbersDays,
  getStartNumbersClassDays,
  isStartNumbersPublishedForDay,
} from '../../../../lib/event'
import { isObject } from '../../../../lib/utils'
import { Path } from '../../../../routeConfig'
import { getPublishingRow, isStartNumbersPublished } from './publishingRow'
import { actionButtonSx, sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartNumbersAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) {
    return published ? 'audit.messages.classStartNumbersPublished' : 'audit.messages.classStartNumbersHidden'
  }
  return published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden'
}

/** The confirmation for a numbers publish or hide; a day's own names the day (KOE-1304). */
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

/** The days a class runs, one per class entry — or the event's own days where it has no classes. */
const classDays = (event: ConfirmedEvent, className: string) =>
  getStartNumbersClassDays(event, event.classes.length ? className : undefined).map((key) => ({
    date: zonedParseDate(key),
    key,
  }))

interface Props {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onSetStartNumbersPublished?: (
    eventClass: RegistrationClass | undefined,
    published: boolean,
    date?: string
  ) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

/**
 * Publishing the start numbers, per class and — for a multi-day class — per day (KOE-1304).
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
    day?: { date: Date; key: string }
  ) => {
    if (!onSetStartNumbersPublished) return

    try {
      await onSetStartNumbersPublished(eventClass, published, day?.key)
      const dayText = day ? t('dateFormat.wdshort', { date: day.date }) : undefined
      enqueueSnackbar(startNumbersMessage(t, eventClass, published, dayText), { variant: 'success' })
    } catch (error) {
      // A half-entered draw is the secretary's own next step, not a save failure — name it (KOE-1218).
      const incomplete =
        error instanceof APIError && isObject(error.body) && error.body.error === 'startNumbersIncomplete'
      enqueueSnackbar(
        t(incomplete ? 'eventManagement.startList.numbersIncomplete' : 'eventManagement.startList.saveFailed'),
        errorSnackbarOptions
      )
    }
  }

  return (
    <Box sx={sectionSx}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
        {t('eventManagement.startList.numbersPublishing')}
      </Typography>
      <TableContainer>
        <Table>
          <TableBody>
            {Object.entries(numbersByClass).map(([className]) => {
              const row = getPublishingRow(
                { event, eventWithCurrentAttachments, selectedByClass, stateByClass },
                className
              )
              const { publishable, startListEventClass, startListPublished } = row
              const numbersPublished = isStartNumbersPublished(event, row.eventClass)
              // Numbers can only be public on a published list, so the buttons wait for the list.
              const canManageStartNumbers =
                Boolean(onSetStartNumbersPublished) && row.manageable && row.invitationsSent && startListPublished
              const days = classDays(event, className)
              const publishedDays = startListPublished ? getPublishedStartNumbersDays(event, startListEventClass) : []
              const partlyPublished = !numbersPublished && publishedDays.length > 0
              const numbersButtons = days.length > 1 ? days : [undefined]

              return (
                <TableRow key={className}>
                  <TableCell align="left">
                    <Box ml={2}>
                      <Typography variant="caption" noWrap fontWeight="bold">
                        {className}
                      </Typography>
                      {numbersPublished && (
                        <Typography variant="caption" color="info.main" display="block" noWrap>
                          {t('eventManagement.startList.numbersPublished')}
                        </Typography>
                      )}
                      {partlyPublished && (
                        <Typography variant="caption" color="info.main" display="block" noWrap>
                          {t('eventManagement.startList.numbersPublishedDays', {
                            days: days
                              .filter((day) => publishedDays.includes(day.key))
                              .map((day) => t('dateFormat.wdshort', { date: day.date }))
                              .join(', '),
                          })}
                        </Typography>
                      )}
                      {/* The list is the numbers' only transport, so say why the buttons are dead. */}
                      {!startListPublished && (
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {t('eventManagement.results.startListRequired')}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" flexWrap="wrap" justifyContent="flex-end" spacing={1} useFlexGap>
                      {numbersButtons.map((day) => {
                        // One button per day of a multi-day class; the whole class otherwise.
                        const dayPublished = day
                          ? startListPublished && isStartNumbersPublishedForDay(event, startListEventClass, day.date)
                          : numbersPublished
                        const dayLabelKey = dayPublished
                          ? 'eventManagement.startList.hideNumbersDay'
                          : 'eventManagement.startList.publishNumbersDay'
                        const classLabelKey = dayPublished
                          ? 'eventManagement.startList.hideNumbers'
                          : 'eventManagement.startList.publishNumbers'
                        const label = day
                          ? t(dayLabelKey, { day: t('dateFormat.wdshort', { date: day.date }) })
                          : t(classLabelKey)

                        return (
                          <Button
                            key={day?.key ?? 'all'}
                            size="small"
                            disabled={!canManageStartNumbers}
                            onClick={() => {
                              if (publishable) handleSetStartNumbersPublished(startListEventClass, !dayPublished, day)
                            }}
                            color={dayPublished ? 'secondary' : 'primary'}
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
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ pb: 1, pt: 0.5, px: 1 }}>
        {/* The draw entry lives with the publish/hide buttons its numbers feed (KOE-1274). */}
        <Button
          fullWidth
          href={Path.admin.startNumbers(event.id)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          variant="outlined"
        >
          {t('eventManagement.enterStartNumbers')}
        </Button>
      </Box>
    </Box>
  )
}

export default StartNumbersPublishing

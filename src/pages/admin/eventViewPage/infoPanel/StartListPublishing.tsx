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
  canPublishStartList,
  getPublishedStartNumbersDays,
  getStartNumbersClassDays,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartNumbersPublishedForClass,
  isStartNumbersPublishedForDay,
} from '../../../../lib/event'
import { getInvitationRecipients, isRegistrationClass } from '../../../../lib/registration'
import { isObject } from '../../../../lib/utils'
import { Path } from '../../../../routeConfig'
import { actionButtonSx, sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartListAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) return published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden'
  return published ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden'
}

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
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly onSetStartNumbersPublished?: (
    eventClass: RegistrationClass | undefined,
    published: boolean,
    date?: string
  ) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const StartListPublishing = ({
  event,
  eventWithCurrentAttachments,
  numbersByClass,
  onSetStartListPublished,
  onSetStartNumbersPublished,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()
  const isStartListPublished = (eventClass?: ConfirmedEvent['classes'][number]) =>
    eventClass
      ? isStartListAvailableForClass(event, eventClass)
      : event.classes.length === 0 && isStartListAvailable(event)
  // Every day of the class: a multi-day class publishes one draw at a time (KOE-1304), and the
  // class only counts as done once the last day is out.
  const isNumbersPublished = (eventClass?: ConfirmedEvent['classes'][number]) =>
    eventClass
      ? isStartListAvailableForClass(event, eventClass) && isStartNumbersPublishedForClass(event, eventClass.class)
      : event.classes.length === 0 && isStartListAvailable(event) && isStartNumbersPublishedForClass(event)
  const startListFullyPublished =
    event.classes.length === 0
      ? isStartListPublished()
      : event.classes.every((eventClass) => isStartListPublished(eventClass))
  // With numbers still withheld the secretary sees more than the public does, so the link is a preview.
  const startNumbersFullyPublished =
    event.classes.length === 0
      ? isNumbersPublished()
      : event.classes.every((eventClass) => isNumbersPublished(eventClass))

  const handleSetStartListPublished = async (eventClass: RegistrationClass | undefined, published: boolean) => {
    const state = eventClass ? (stateByClass[eventClass] ?? event.state) : event.state
    if (!canPublishStartList(state, event) || !onSetStartListPublished) return

    try {
      await onSetStartListPublished(eventClass, published)
      enqueueSnackbar(t(getStartListAuditMessageKey(eventClass, published), { eventClass }), { variant: 'success' })
    } catch {
      enqueueSnackbar(t('eventManagement.startList.saveFailed'), errorSnackbarOptions)
    }
  }

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
        {t('eventManagement.startList.publishing')}
      </Typography>
      <TableContainer>
        <Table>
          <TableBody>
            {Object.entries(numbersByClass).map(([className]) => {
              const selected = selectedByClass[className] ?? []
              const invitationsSent =
                selected.length > 0 && getInvitationRecipients(eventWithCurrentAttachments, selected).length === 0
              const classState = stateByClass[className] ?? event.state
              const startListPublished = isStartListPublished(
                event.classes.find((eventClass) => eventClass.class === className)
              )
              const classlessEventRow = event.classes.length === 0 && className === event.eventType
              const startListEventClass = isRegistrationClass(className) ? className : undefined
              // A finished event deliberately does not disable this. Publishing the list is what carries
              // the results to the public, and results are entered after the dogs have run — unlike
              // picking participants or sending invitations, which a finished event should not reopen.
              const startListManageable =
                Boolean(onSetStartListPublished) &&
                (classlessEventRow || Boolean(startListEventClass)) &&
                canPublishStartList(classState, event)
              const canManageStartList = invitationsSent && startListManageable
              const numbersPublished = isNumbersPublished(
                event.classes.find((eventClass) => eventClass.class === className)
              )
              // Numbers can only be public on a published list, so the button waits for the list.
              const canManageStartNumbers =
                Boolean(onSetStartNumbersPublished) && startListManageable && startListPublished
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
                      {startListPublished && (
                        <Typography variant="caption" color="info.main" display="block" noWrap>
                          {t('eventManagement.startList.published')}
                        </Typography>
                      )}
                      {startListPublished && numbersPublished && (
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
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" flexWrap="wrap" justifyContent="flex-end" spacing={1} useFlexGap>
                      <Button
                        size="small"
                        disabled={!canManageStartList}
                        onClick={() => {
                          if (classlessEventRow || startListEventClass) {
                            handleSetStartListPublished(startListEventClass, !startListPublished)
                          }
                        }}
                        color={startListPublished ? 'secondary' : 'primary'}
                        variant={canManageStartList ? 'contained' : 'outlined'}
                      >
                        {t(startListPublished ? 'eventManagement.startList.hide' : 'eventManagement.startList.publish')}
                      </Button>
                      {numbersButtons.map((day) => {
                        // One button per day of a multi-day class; the whole class otherwise.
                        const dayPublished = day
                          ? startListPublished && isStartNumbersPublishedForDay(event, startListEventClass, day.date)
                          : numbersPublished
                        const label = day
                          ? t(
                              dayPublished
                                ? 'eventManagement.startList.hideNumbersDay'
                                : 'eventManagement.startList.publishNumbersDay',
                              { day: t('dateFormat.wdshort', { date: day.date }) }
                            )
                          : t(
                              dayPublished
                                ? 'eventManagement.startList.hideNumbers'
                                : 'eventManagement.startList.publishNumbers'
                            )

                        return (
                          <Button
                            key={day?.key ?? 'all'}
                            size="small"
                            disabled={!canManageStartNumbers}
                            onClick={() => {
                              if (classlessEventRow || startListEventClass) {
                                handleSetStartNumbersPublished(startListEventClass, !dayPublished, day)
                              }
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
          sx={{ ...actionButtonSx, mb: 1 }}
          variant="outlined"
        >
          {t('eventManagement.enterStartNumbers')}
        </Button>
        <Button
          fullWidth
          href={Path.admin.startListPreview(event.id)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          target="_blank"
          variant="outlined"
        >
          {t(
            startListFullyPublished && startNumbersFullyPublished
              ? 'eventManagement.startList.preview'
              : 'eventManagement.startList.previewUnpublished'
          )}
        </Button>
      </Box>
    </Box>
  )
}

export default StartListPublishing

import type { ChangeEvent } from 'react'
import type { AuditRecord, ConfirmedEvent, EmailTemplateId, Registration, RegistrationClass } from '../../../types'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import FormatListBulleted from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { getEventAuditTrail, putInvitationAttachment } from '../../../api/event'
import { APIError } from '../../../api/http'
import useAdminEventRegistrationInfo from '../../../hooks/useAdminEventRegistrationsInfo'
import { reportError } from '../../../lib/client/error'
import { canPublishStartList, isStartListPublishedForClass } from '../../../lib/event'
import { getParticipantMessageInfo, isRegistrationClass } from '../../../lib/registration'
import { errorSnackbarOptions } from '../../../lib/snackbar'
import { invitationAttachmentFileName, Path } from '../../../routeConfig'
import { idTokenAtom } from '../../recoil'
import { AuditTrail } from '../components/AuditTrail'
import { adminEventSelector } from '../recoil'

interface Props {
  readonly event: ConfirmedEvent
  readonly onCreateRegistration?: () => void
  readonly onOpenDetails?: () => void
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly registrations: Registration[]
  readonly onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
}

const APP_HEADER_HEIGHT = 36
const sectionSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  overflow: 'hidden',
}
const actionButtonSx = { justifyContent: 'flex-start', textAlign: 'left' }

const InfoPanel = ({
  event,
  onCreateRegistration,
  onOpenDetails,
  onSetStartListPublished,
  registrations,
  onOpenMessageDialog,
}: Props) => {
  const { t } = useTranslation()
  const token = useRecoilValue(idTokenAtom)
  const [attachmentKey, setAttachmentKey] = useState(event.invitationAttachment)
  const [classAttachmentKeys, setClassAttachmentKeys] = useState(event.invitationAttachments ?? {})
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])
  const setEvent = useSetRecoilState(adminEventSelector(event.id))
  const [expanded, setExpanded] = useState(false)
  const eventClasses = useMemo(() => [...new Set(event.classes.map((c) => c.class))], [event.classes])
  const eventWithCurrentAttachments = useMemo(
    () => ({ ...event, invitationAttachment: attachmentKey, invitationAttachments: classAttachmentKeys }),
    [attachmentKey, classAttachmentKeys, event]
  )
  const { reserveByClass, numbersByClass, selectedByClass, stateByClass } = useAdminEventRegistrationInfo(
    event,
    registrations
  )
  const toggle = useCallback(() => setExpanded((old) => !old), [])
  const handleSetStartListPublished = useCallback(
    async (eventClass: RegistrationClass | undefined, published: boolean) => {
      const state = eventClass ? (stateByClass[eventClass] ?? event.state) : event.state
      if (!canPublishStartList(state)) {
        return
      }
      if (!onSetStartListPublished) {
        return
      }

      try {
        await onSetStartListPublished(eventClass, published)
        enqueueSnackbar(`${eventClass ? `${eventClass} ` : ''}starttilista ${published ? 'julkaistu' : 'piilotettu'}`, {
          variant: 'success',
        })
      } catch {
        enqueueSnackbar('Starttilistan julkaisutilan tallennus epäonnistui. Yritä uudelleen.', errorSnackbarOptions)
      }
    },
    [event, onSetStartListPublished, stateByClass]
  )
  const handleInvitationUpload = useCallback(
    (className?: RegistrationClass) => async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target

      if (!input.files) {
        console.log('no files')
        return
      }

      try {
        const fileKey = await putInvitationAttachment(event.id, input.files[0], className, token)
        if (className) {
          const classEvent = event.classes.find((item) => item.class === className)
          const fileName = invitationAttachmentFileName({
            ...event,
            class: className,
            invitationAttachment: fileKey,
            startDate: classEvent?.date ?? event.startDate,
          })
          const invitationAttachments = {
            ...classAttachmentKeys,
            [className]: fileKey,
          }
          setClassAttachmentKeys(invitationAttachments)
          setEvent({ ...event, invitationAttachments })
          enqueueSnackbar(
            `${className} koekutsu ${
              event.invitationAttachments?.[className] ? 'päivitetty' : 'liitetty'
            }: ${fileName}`,
            {
              variant: 'success',
            }
          )
        } else {
          const update = Boolean(event.invitationAttachment)
          const fileName = invitationAttachmentFileName({ ...event, invitationAttachment: fileKey })
          setAttachmentKey(fileKey)
          setEvent({ ...event, invitationAttachment: fileKey })
          enqueueSnackbar(`${update ? 'Koekutsu päivitetty' : 'Koekutsu liitetty'}: ${fileName}`, {
            variant: 'success',
          })
        }
      } catch (error) {
        if (error instanceof APIError && error.status === 413) {
          enqueueSnackbar(
            'Koekutsun tiedosto on liian suuri. Pienennä PDF-tiedoston kokoa ja yritä uudelleen.',
            errorSnackbarOptions
          )
          return
        }

        enqueueSnackbar('Koekutsun liittäminen epäonnistui. Yritä uudelleen.', errorSnackbarOptions)
      } finally {
        input.value = ''
      }
    },
    [classAttachmentKeys, event, setEvent, token]
  )

  useEffect(() => {
    if (!expanded || !token) return

    getEventAuditTrail(event.id, token)
      .then((at) => setAuditTrail(at ?? []))
      .catch((e) => {
        reportError(e)
        setAuditTrail([])
      })
  }, [event.id, expanded, token])

  if (!expanded) {
    return (
      <Button
        aria-label="Avaa tilannepaneeli"
        onClick={toggle}
        sx={{
          alignItems: 'center',
          borderBottomRightRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: 3,
          minWidth: 36,
          position: 'fixed',
          px: 0.75,
          py: 1.25,
          right: 0,
          top: APP_HEADER_HEIGHT + 12,
          writingMode: 'vertical-rl',
          zIndex: (theme) => theme.zIndex.drawer,
        }}
        variant="contained"
      >
        Tapahtuman hallinta
      </Button>
    )
  }

  return (
    <Drawer
      anchor="right"
      onClose={() => setExpanded(false)}
      open={expanded}
      variant="temporary"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'transparent',
          },
        },
        paper: {
          sx: {
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
            height: `calc(100% - ${APP_HEADER_HEIGHT}px)`,
            maxWidth: 'calc(100vw - 16px)',
            minWidth: { sm: 480 },
            overflow: 'auto',
            top: APP_HEADER_HEIGHT,
            width: { sm: 'max-content', xs: 'calc(100vw - 16px)' },
          },
        },
      }}
    >
      <Box
        sx={{
          '& .MuiTableContainer-root': {
            '& .MuiTableCell-root': { px: 1, py: 0.5 },
            width: '100%',
          },
          display: 'grid',
          gap: 1.5,
          p: 1.5,
        }}
      >
        <Grid container alignItems="center">
          <Grid size="grow">
            <Typography variant="subtitle1" fontWeight="bold">
              Tapahtuman hallinta
            </Typography>
          </Grid>
          <Grid size="auto">
            <Tooltip title="Sulje tilannepaneeli">
              <IconButton size="small" color={'primary'} onClick={toggle} aria-label="Sulje tilannepaneeli">
                <KeyboardArrowRight />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>

        <Box sx={sectionSx}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
            Tapahtuman tilanne
          </Typography>
          <TableContainer>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography variant="caption" noWrap>
                      Osallistujat
                    </Typography>
                  </TableCell>
                </TableRow>
                {Object.entries(numbersByClass).map(([c, nums]) => {
                  const selected = selectedByClass[c] ?? []
                  const { canSend, recipients, templateId } = getParticipantMessageInfo(
                    eventWithCurrentAttachments,
                    stateByClass[c],
                    selected
                  )
                  const messageLabel = templateId === 'picked' ? 'koepaikkailmoitus' : 'koekutsu'
                  const invitationsSent = templateId === 'invitation' && selected.length > 0 && recipients.length === 0
                  const startListPublished = isStartListPublishedForClass(event, c)
                  const classlessEventRow = event.classes.length === 0 && c === event.eventType
                  const startListEventClass = isRegistrationClass(c) ? c : undefined
                  const startListManageable =
                    Boolean(onSetStartListPublished) &&
                    (classlessEventRow || Boolean(startListEventClass)) &&
                    canPublishStartList(stateByClass[c] ?? event.state)

                  return (
                    <TableRow key={c}>
                      <TableCell align="left">
                        <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                          {c}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" noWrap color={nums.invalid ? 'error' : 'info.dark'}>
                          {nums.participants} / {nums.places}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack alignItems="flex-end" spacing={0.25}>
                          {invitationsSent ? (
                            <>
                              <Typography
                                variant="caption"
                                color="info.main"
                                sx={{ alignItems: 'center', display: 'flex', minHeight: 30 }}
                              >
                                Koekutsut lähetetty
                              </Typography>
                              <Button
                                size="small"
                                disabled={!startListManageable}
                                onClick={() => {
                                  if (classlessEventRow || startListEventClass) {
                                    handleSetStartListPublished(startListEventClass, !startListPublished)
                                  }
                                }}
                                variant="outlined"
                              >
                                {startListPublished ? 'Piilota starttilista' : 'Julkaise starttilista'}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="small"
                              disabled={nums.participants === 0 || nums.invalid || !canSend}
                              onClick={() => onOpenMessageDialog?.(recipients, templateId)}
                              variant="outlined"
                            >
                              Lähetä {messageLabel}
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography variant="caption" noWrap>
                      Varasijalla
                    </Typography>
                  </TableCell>
                </TableRow>
                {Object.entries(numbersByClass).map(([c, nums]) => {
                  return (
                    <TableRow key={c}>
                      <TableCell align="left">
                        <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                          {c}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" noWrap color="info.dark">
                          {nums.reserve}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          disabled={nums.reserve === 0}
                          onClick={() => onOpenMessageDialog?.(reserveByClass[c], 'reserve')}
                          variant="outlined"
                        >
                          Lähetä varasijailmoitus
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box sx={sectionSx}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
            Koekutsu
          </Typography>
          <TableContainer>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell align="left" colSpan={2} sx={{ borderBottom: 0, pb: 0 }}>
                    <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                      Kokeen koekutsun liitetiedosto
                    </Typography>
                  </TableCell>
                  <TableCell rowSpan={2} sx={{ verticalAlign: 'middle' }}>
                    <input
                      accept="application/pdf"
                      type="file"
                      hidden
                      id="koekutsu-file"
                      onChange={handleInvitationUpload()}
                    />
                    <label htmlFor="koekutsu-file">
                      <Button component="span" size="small" variant="outlined">
                        Liitä kokeelle
                      </Button>
                    </label>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2} sx={{ pt: 0 }}>
                    {attachmentKey ? (
                      <Box ml={2}>
                        <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
                        <Link
                          href={Path.invitationAttachment({ ...event, invitationAttachment: attachmentKey })}
                          rel="noopener"
                          target="_blank"
                          type="application/pdf"
                          variant="caption"
                        >
                          {invitationAttachmentFileName({ ...event, invitationAttachment: attachmentKey })}
                        </Link>
                      </Box>
                    ) : (
                      <Typography variant="caption" fontStyle="italic" ml={2}>
                        Ei liitettyä tiedostoa
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
                {eventClasses.map((eventClass) => {
                  const classAttachmentKey = classAttachmentKeys[eventClass]
                  const classEvent = event.classes.find((item) => item.class === eventClass)
                  const classInvitationEvent = {
                    ...event,
                    class: eventClass,
                    invitationAttachment: classAttachmentKey,
                    startDate: classEvent?.date ?? event.startDate,
                  }

                  return (
                    <Fragment key={`invitation-attachment-${eventClass}`}>
                      <TableRow key={`invitation-attachment-${eventClass}`}>
                        <TableCell align="left" colSpan={2} sx={{ borderBottom: 0, pb: 0 }}>
                          <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                            {eventClass}-luokan koekutsun liitetiedosto
                          </Typography>
                        </TableCell>
                        <TableCell rowSpan={2} sx={{ verticalAlign: 'middle' }}>
                          <input
                            accept="application/pdf"
                            type="file"
                            hidden
                            id={`koekutsu-file-${eventClass}`}
                            onChange={handleInvitationUpload(eventClass)}
                          />
                          <label htmlFor={`koekutsu-file-${eventClass}`}>
                            <Button component="span" size="small" variant="outlined">
                              Liitä luokalle
                            </Button>
                          </label>
                        </TableCell>
                      </TableRow>
                      <TableRow key={`invitation-attachment-file-${eventClass}`}>
                        <TableCell colSpan={2} sx={{ pt: 0 }}>
                          {classAttachmentKey ? (
                            <Box ml={2}>
                              <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
                              <Link
                                href={Path.invitationAttachment(classInvitationEvent)}
                                rel="noopener"
                                target="_blank"
                                type="application/pdf"
                                variant="caption"
                              >
                                {invitationAttachmentFileName(classInvitationEvent)}
                              </Link>
                            </Box>
                          ) : (
                            <Typography variant="caption" fontStyle="italic" ml={2}>
                              Ei liitettyä tiedostoa
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box sx={sectionSx}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
            Toiminnot
          </Typography>
          <Stack spacing={1} sx={{ p: 1 }}>
            <Button
              fullWidth
              onClick={onOpenDetails}
              startIcon={<FormatListBulleted />}
              sx={actionButtonSx}
              variant="outlined"
            >
              Näytä tapahtuman tiedot
            </Button>
            <Button
              fullWidth
              onClick={onCreateRegistration}
              startIcon={<AddCircleOutline />}
              sx={actionButtonSx}
              variant="outlined"
            >
              {t('createRegistration')}
            </Button>
            <Button
              fullWidth
              href={Path.admin.startList(event.id)}
              startIcon={<FormatListNumberedOutlined />}
              sx={actionButtonSx}
              target="_blank"
              variant="outlined"
            >
              Sihteerin starttilista
            </Button>
          </Stack>
        </Box>

        <AuditTrail auditTrail={auditTrail} />
      </Box>
    </Drawer>
  )
}

export default InfoPanel

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
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { getEventAuditTrail, putInvitationAttachment } from '../../../api/event'
import { APIError } from '../../../api/http'
import useAdminEventRegistrationInfo from '../../../hooks/useAdminEventRegistrationsInfo'
import { mergeAuditTrail, useAuditTrailSubscription } from '../../../hooks/useAuditTrailSubscription'
import { reportError } from '../../../lib/client/error'
import { canPublishStartList, isStartListPublishedForClass } from '../../../lib/event'
import { invitationAttachmentFileName } from '../../../lib/fileName'
import { getParticipantMessageInfo, isRegistrationClass } from '../../../lib/registration'
import { errorSnackbarOptions } from '../../../lib/snackbar'
import { isEntryClosed } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import { validIdTokenSelector } from '../../recoil'
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

interface InvitationAttachmentRowProps {
  readonly file?: {
    readonly href: string
    readonly name: string
  }
  readonly inputId: string
  readonly label: string
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

const InvitationAttachmentRow = ({ file, inputId, label, onChange }: InvitationAttachmentRowProps) => (
  <>
    <TableRow>
      <TableCell align="left" colSpan={2} sx={{ borderBottom: 0, pb: 0 }}>
        <Typography variant="caption" fontWeight="bold" ml={2}>
          {label}
        </Typography>
      </TableCell>
      <TableCell rowSpan={2} sx={{ verticalAlign: 'middle' }}>
        <input accept="application/pdf" type="file" hidden id={inputId} onChange={onChange} />
        <label htmlFor={inputId}>
          <Button component="span" size="small" variant="outlined">
            {file ? 'Vaihda PDF' : 'Lisää PDF'}
          </Button>
        </label>
      </TableCell>
    </TableRow>
    <TableRow>
      <TableCell colSpan={2} sx={{ pt: 0 }}>
        {file ? (
          <Box ml={2}>
            <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
            <Link href={file.href} rel="noopener" target="_blank" type="application/pdf" variant="caption">
              {file.name}
            </Link>
          </Box>
        ) : (
          <Typography variant="caption" fontStyle="italic" ml={2}>
            Ei tiedostoa
          </Typography>
        )}
      </TableCell>
    </TableRow>
  </>
)

const InfoPanel = ({
  event,
  onCreateRegistration,
  onOpenDetails,
  onSetStartListPublished,
  registrations,
  onOpenMessageDialog,
}: Props) => {
  const { t } = useTranslation()
  const token = useRecoilValue(validIdTokenSelector)
  const [attachmentKey, setAttachmentKey] = useState(event.invitationAttachment)
  const [classAttachmentKeys, setClassAttachmentKeys] = useState(event.invitationAttachments ?? {})
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const setEvent = useSetRecoilState(adminEventSelector(event.id))
  const [expanded, setExpanded] = useState(false)
  useAuditTrailSubscription(`event:${event.id}`, expanded, setAuditTrail)
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
    setAttachmentKey(event.invitationAttachment)
    setClassAttachmentKeys(event.invitationAttachments ?? {})
  }, [event.invitationAttachment, event.invitationAttachments])

  useEffect(() => {
    if (!expanded || !token) return

    getEventAuditTrail(event.id, token)
      .then((at) => setAuditTrail((current) => mergeAuditTrail(at ?? [], current)))
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
            display: 'flex',
            flexDirection: 'column',
            height: `calc(100% - ${APP_HEADER_HEIGHT}px)`,
            overflow: 'hidden',
            top: APP_HEADER_HEIGHT,
            width: 'min(480px, calc(100vw - 16px))',
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
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <Box sx={{ alignItems: 'center', display: 'flex', pl: 1.5 }}>
          <Tabs
            aria-label="Tapahtuman hallinnan välilehdet"
            onChange={(_, value: number) => setActiveTab(value)}
            sx={{ flex: 1 }}
            value={activeTab}
          >
            <Tab label="Tapahtuman hallinta" />
            <Tab label="Muutoshistoria" />
          </Tabs>
          <Box sx={{ pr: 1.5 }}>
            <Tooltip title="Sulje tilannepaneeli">
              <IconButton size="small" color={'primary'} onClick={toggle} aria-label="Sulje tilannepaneeli">
                <KeyboardArrowRight />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box
          sx={{
            display: activeTab === 0 ? 'grid' : 'none',
            flex: 1,
            gap: 1.5,
            minHeight: 0,
            overflowY: 'auto',
            p: 1.5,
          }}
        >
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
                    const invitationsSent =
                      templateId === 'invitation' && selected.length > 0 && recipients.length === 0
                    const placeConfirmationsBlockedByEntry = templateId === 'picked' && !isEntryClosed(event)
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
                            ) : placeConfirmationsBlockedByEntry ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  alignItems: 'center',
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  minHeight: 30,
                                }}
                              >
                                Koepaikkailmoitukset voi lähettää ilmoittautumisajan päätyttyä
                              </Typography>
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
                    const reserves = reserveByClass[c] ?? []
                    const reserveNotificationsSent =
                      reserves.length > 0 && reserves.every((registration) => registration.reserveNotified)

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
                          {reserveNotificationsSent ? (
                            <Typography
                              variant="caption"
                              color="info.main"
                              sx={{ alignItems: 'center', display: 'flex', justifyContent: 'flex-end', minHeight: 30 }}
                            >
                              Varasijailmoitukset lähetetty
                            </Typography>
                          ) : (
                            <Button
                              size="small"
                              disabled={nums.reserve === 0}
                              onClick={() => onOpenMessageDialog?.(reserves, 'reserve')}
                              variant="outlined"
                            >
                              Lähetä varasijailmoitus
                            </Button>
                          )}
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
              <Table sx={{ '& .MuiTableCell-root': { overflowWrap: 'anywhere' }, tableLayout: 'fixed' }}>
                <TableBody>
                  <InvitationAttachmentRow
                    file={
                      attachmentKey
                        ? {
                            href: Path.invitationAttachment({ ...event, invitationAttachment: attachmentKey }),
                            name: invitationAttachmentFileName({ ...event, invitationAttachment: attachmentKey }),
                          }
                        : undefined
                    }
                    inputId="koekutsu-file"
                    label="Koko koe"
                    onChange={handleInvitationUpload()}
                  />
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
                      <InvitationAttachmentRow
                        file={
                          classAttachmentKey
                            ? {
                                href: Path.invitationAttachment(classInvitationEvent),
                                name: invitationAttachmentFileName(classInvitationEvent),
                              }
                            : undefined
                        }
                        inputId={`koekutsu-file-${eventClass}`}
                        key={`invitation-attachment-${eventClass}`}
                        label={`${eventClass}-luokka`}
                        onChange={handleInvitationUpload(eventClass)}
                      />
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
              <Button
                fullWidth
                href={Path.admin.startListPreview(event.id)}
                startIcon={<FormatListNumberedOutlined />}
                sx={actionButtonSx}
                target="_blank"
                variant="outlined"
              >
                Katso julkinen starttilista
              </Button>
            </Stack>
          </Box>
        </Box>

        <Box sx={{ display: activeTab === 1 ? 'flex' : 'none', flex: 1, minHeight: 0, p: 1.5 }}>
          <AuditTrail auditTrail={auditTrail} fullHeight />
        </Box>
      </Box>
    </Drawer>
  )
}

export default InfoPanel

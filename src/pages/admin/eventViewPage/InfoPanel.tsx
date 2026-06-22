import type { ChangeEvent } from 'react'
import type { ConfirmedEvent, EmailTemplateId, Registration, RegistrationClass } from '../../../types'
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
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { putInvitationAttachment } from '../../../api/event'
import { APIError } from '../../../api/http'
import useAdminEventRegistrationInfo from '../../../hooks/useAdminEventRegistrationsInfo'
import { OFFICIAL_EVENT_TYPES } from '../../../lib/event'
import { getInvitationAttachment } from '../../../lib/registration'
import { errorSnackbarOptions } from '../../../lib/snackbar'
import { Path } from '../../../routeConfig'
import { idTokenAtom } from '../../recoil'
import { adminEventSelector } from '../recoil'

interface Props {
  readonly event: ConfirmedEvent
  readonly onCreateRegistration?: () => void
  readonly onOpenDetails?: () => void
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

const InfoPanel = ({ event, onCreateRegistration, onOpenDetails, registrations, onOpenMessageDialog }: Props) => {
  const { t } = useTranslation()
  const token = useRecoilValue(idTokenAtom)
  const [attachmentKey, setAttachmentKey] = useState(event.invitationAttachment)
  const [classAttachmentKeys, setClassAttachmentKeys] = useState(event.invitationAttachments ?? {})
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
          const invitationAttachments = {
            ...classAttachmentKeys,
            [className]: fileKey,
          }
          setClassAttachmentKeys(invitationAttachments)
          setEvent({ ...event, invitationAttachments })
          enqueueSnackbar(
            `${className} koekutsu ${event.invitationAttachments?.[className] ? 'päivitetty' : 'liitetty'}`,
            {
              variant: 'success',
            }
          )
        } else {
          const update = Boolean(event.invitationAttachment)
          setAttachmentKey(fileKey)
          setEvent({ ...event, invitationAttachment: fileKey })
          enqueueSnackbar(update ? 'Koekutsu päivitetty' : 'Koekutsu liitetty', { variant: 'success' })
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
  if (!expanded) {
    return (
      <Button
        aria-label="Avaa tilannepaneeli"
        onClick={toggle}
        size="small"
        sx={{
          alignItems: 'center',
          borderBottomRightRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: 3,
          fontSize: '0.65rem',
          minWidth: 28,
          position: 'fixed',
          px: 0.5,
          py: 1,
          right: 0,
          top: APP_HEADER_HEIGHT + 12,
          writingMode: 'vertical-rl',
          zIndex: (theme) => theme.zIndex.drawer,
        }}
        variant="contained"
      >
        Tilanne
      </Button>
    )
  }

  return (
    <Drawer
      anchor="right"
      open={expanded}
      variant="persistent"
      slotProps={{
        paper: {
          sx: {
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
            height: `calc(100% - ${APP_HEADER_HEIGHT}px)`,
            overflow: 'auto',
            top: APP_HEADER_HEIGHT,
            width: { sm: 420, xs: 'calc(100vw - 16px)' },
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
                  const staleInvitationRecipients = selected.filter((registration) => {
                    const currentAttachment = getInvitationAttachment(eventWithCurrentAttachments, registration)
                    return (
                      registration.messagesSent?.invitation &&
                      currentAttachment &&
                      registration.invitationAttachmentSent !== currentAttachment
                    )
                  })
                  const recipients = stateByClass[c] === 'invited' ? staleInvitationRecipients : selected
                  const canSendParticipantsMessage =
                    stateByClass[c] === 'confirmed' ||
                    stateByClass[c] === 'picked' ||
                    (stateByClass[c] === 'invited' && staleInvitationRecipients.length > 0)
                  const messageTemplate = stateByClass[c] === 'confirmed' ? 'picked' : 'invitation'
                  const messageLabel = messageTemplate === 'picked' ? 'koepaikkailmoitus' : 'koekutsu'

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
                        <Button
                          size="small"
                          disabled={nums.participants === 0 || nums.invalid || !canSendParticipantsMessage}
                          onClick={() => onOpenMessageDialog?.(recipients, messageTemplate)}
                          variant="outlined"
                        >
                          Lähetä {messageLabel}
                        </Button>
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
            Valmistelu
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell colSpan={3}>Kokeen tiedot</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {OFFICIAL_EVENT_TYPES.includes(event.eventType) && (
                  <TableRow>
                    <TableCell align="left">
                      <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                        Koetunnus
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {event.kcId ? (
                        <Typography variant="caption">{event.kcId}</Typography>
                      ) : (
                        <Typography variant="caption" fontStyle="italic">
                          Ei haettua koetunnusta
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
                <TableRow>
                  <TableCell align="left">
                    <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                      Koekutsu
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {attachmentKey ? (
                      <>
                        <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
                        <Link
                          href={Path.invitationAttachment({ ...event, invitationAttachment: attachmentKey })}
                          rel="noopener"
                          target="_blank"
                          type="application/pdf"
                          variant="caption"
                        >
                          Kutsu.pdf
                        </Link>
                      </>
                    ) : (
                      <Typography variant="caption" fontStyle="italic">
                        Ei liitettyä tiedostoa
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <input
                      accept="application/pdf"
                      type="file"
                      hidden
                      id="koekutsu-file"
                      onChange={handleInvitationUpload()}
                    />
                    <label htmlFor="koekutsu-file">
                      <Button component="span" size="small" variant="outlined">
                        Liitä yleinen
                      </Button>
                    </label>
                  </TableCell>
                </TableRow>
                {eventClasses.map((eventClass) => {
                  const classAttachmentKey = classAttachmentKeys[eventClass]
                  const classEvent = event.classes.find((item) => item.class === eventClass)

                  return (
                    <TableRow key={`invitation-attachment-${eventClass}`}>
                      <TableCell align="left">
                        <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                          {eventClass} koekutsu
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {classAttachmentKey ? (
                          <>
                            <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
                            <Link
                              href={Path.invitationAttachment({
                                ...event,
                                class: eventClass,
                                invitationAttachment: classAttachmentKey,
                                startDate: classEvent?.date ?? event.startDate,
                              })}
                              rel="noopener"
                              target="_blank"
                              type="application/pdf"
                              variant="caption"
                            >
                              Kutsu.pdf
                            </Link>
                          </>
                        ) : (
                          <Typography variant="caption" fontStyle="italic">
                            Käyttää yleistä kutsua
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
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
            <Button fullWidth onClick={onOpenDetails} startIcon={<FormatListBulleted />} variant="outlined">
              Näytä tapahtuman tiedot
            </Button>
            <Button fullWidth onClick={onCreateRegistration} startIcon={<AddCircleOutline />} variant="outlined">
              {t('createRegistration')}
            </Button>
            <Button
              fullWidth
              href={Path.admin.startList(event.id)}
              startIcon={<FormatListNumberedOutlined />}
              target="_blank"
              variant="outlined"
            >
              Sihteerin starttilista
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  )
}

export default InfoPanel

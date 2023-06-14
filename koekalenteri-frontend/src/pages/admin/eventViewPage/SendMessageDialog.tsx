import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowForwardIosSharp, CheckBox } from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
// @ts-ignore handlebars 4.8 should fix this issue
import Handlebars from 'handlebars/dist/cjs/handlebars.js'
import { EmailTemplate, EmailTemplateId, Event, Language, Registration } from 'koekalenteri-shared/model'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'
import { useRecoilValue, useSetRecoilState } from 'recoil'

import { sendTemplatedEmail } from '../../../api/email'
import { formatDateSpan } from '../../../i18n/dates'
import { Path } from '../../../routeConfig'
import AutocompleteSingle from '../../components/AutocompleteSingle'
import { idTokenAtom } from '../../recoil'
import { adminEventSelector, emailTemplatesAtom } from '../recoil'

interface Props {
  registrations: Registration[]
  templateId?: EmailTemplateId
  open: boolean
  event: Event
  onClose?: () => void
}

export default function SendMessageDialog({ event, registrations, templateId, open, onClose }: Props) {
  const confirm = useConfirm()
  const { i18n, t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const token = useRecoilValue(idTokenAtom)
  const templates = useRecoilValue(emailTemplatesAtom)
  const setEvent = useSetRecoilState(adminEventSelector(event.id))
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | undefined>(
    templates.find((t) => t.id === templateId)
  )
  const [compiledTemplate, compiledSubject] = useMemo(() => {
    const ses = selectedTemplate?.ses?.[i18n.language as Language]
    if (!ses) {
      return [undefined, undefined]
    }
    return [Handlebars.compile(ses.HtmlPart), Handlebars.compile(ses.SubjectPart)]
  }, [i18n.language, selectedTemplate?.ses])
  const previewData = useRegistrationEmailTemplateData(registrations[0], event, '', text)

  useEffect(() => {
    if (templateId && templates?.length) {
      if (templateId !== selectedTemplate?.id) {
        setSelectedTemplate(templates.find((t) => t.id === templateId))
      }
    }
  }, [templates, templateId, selectedTemplate])

  const handleTemplateChange = (value: EmailTemplate | null) => setSelectedTemplate(value ?? undefined)
  const preview = useMemo(() => {
    if (!previewData || !compiledTemplate || !compiledSubject) {
      return { subject: '', html: '' }
    }
    return {
      subject: compiledSubject(previewData),
      html: compiledTemplate(previewData),
    }
  }, [compiledTemplate, compiledSubject, previewData])

  const handleSend = useCallback(() => {
    if (!templateId) {
      return
    }
    confirm({
      title: 'Viestin lähettäminen',
      content: (
        <div>
          Olet lähettämässä viestiä {t(`emailTemplate.${templateId}`)} {registrations.length} ilmoittautumiseen.
          <br />
          Oletko varma, että haluat lähettää viestin?
        </div>
      ),
      confirmationText: 'Lähetä',
      cancellationText: t('cancel'),
      cancellationButtonProps: { variant: 'outlined' },
      confirmationButtonProps: { autoFocus: true, variant: 'contained' },
      dialogActionsProps: {
        sx: {
          flexDirection: 'row-reverse',
          justifyContent: 'flex-start',
          columnGap: 1,
        },
      },
    }).then(() => {
      setSending(true)
      sendTemplatedEmail(
        {
          template: templateId,
          eventId: event.id,
          registrationIds: registrations.map<string>((r) => r.id),
          text,
        },
        token
      )
        .then(({ ok, failed, state, classes } = { ok: [], failed: [], state: event.state, classes: event.classes }) => {
          if (ok.length) {
            enqueueSnackbar('Viesti lähetetty onnistuneesti\n\n' + ok.join('\n'), {
              variant: 'success',
              style: { whiteSpace: 'pre-line' },
            })
          }
          if (failed.length) {
            enqueueSnackbar('Viestin lähetys epäonnistui 💩\n\n' + failed.join('\n'), {
              variant: 'success',
              style: { whiteSpace: 'pre-line' },
            })
          }
          setEvent({ ...event, state, classes })
          setSending(false)
          onClose?.()
        })
        .catch((error: Error) => {
          enqueueSnackbar('Viestin lähetys epäonnistui 💩', { variant: 'error' })
          console.log(error)
        })
    })
  }, [confirm, enqueueSnackbar, event, onClose, registrations, setEvent, t, templateId, text, token])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Viestin lähettäminen</DialogTitle>
      <DialogContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ width: '40%' }}>
            <Accordion
              disableGutters
              elevation={0}
              square
              sx={{
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <AccordionSummary
                expandIcon={<ArrowForwardIosSharp sx={{ fontSize: '0.9rem' }} />}
                sx={{
                  px: 1,
                  minHeight: 32,
                  flexDirection: 'row-reverse',
                  '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
                    transform: 'rotate(90deg)',
                  },
                  '& .MuiAccordionSummary-content': {
                    marginX: 1,
                    marginY: 0,
                  },
                }}
              >
                Vastaanottajat: {registrations.length}
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, maxHeight: 300, overflowY: 'auto' }}>
                <List dense sx={{ p: 0 }}>
                  {registrations.map((r) => (
                    <ListItem key={r.id} sx={{ py: 0, borderTop: '1px dashed', borderTopColor: 'divider' }}>
                      <ListItemText primary={r.dog.name} secondary={listEmails(r)} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>

            <Typography variant="h6">Viesti</Typography>

            <Paper sx={{ width: '100%', p: 1, bgcolor: 'background.form' }}>
              <AutocompleteSingle
                getOptionLabel={(o) => (o ? t(`emailTemplate.${o.id}`) : '')}
                isOptionEqualToValue={(o, v) => o?.id === v?.id}
                options={templates}
                onChange={handleTemplateChange}
                label={'Viestin tyyppi'}
                value={selectedTemplate}
              />
              <FormControl component="fieldset" sx={{ my: 1 }}>
                <FormLabel component="legend">Yhteystiedot:</FormLabel>
                <FormGroup sx={{ mx: 2, my: 1 }}>
                  <FormControlLabel control={<CheckBox name="official" />} label={t('event.official')} />
                  <FormControlLabel control={<CheckBox name="secretary" />} label={t('event.secretary')} />
                </FormGroup>
              </FormControl>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Voit lisätä tähän halutessasi lisäviestin:</FormLabel>
                <TextField fullWidth multiline rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </FormControl>
            </Paper>
          </Box>
          <Box sx={{ width: '60%' }}>
            <Typography variant="h6">Esikatselu</Typography>
            <Paper sx={{ width: '100%', p: 1 }}>
              Aihe:&nbsp;{preview.subject}
              <div className="preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </Paper>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <LoadingButton disabled={!selectedTemplate} loading={sending} variant="contained" onClick={handleSend}>
          Lähetä
        </LoadingButton>
        <Button variant="outlined" onClick={onClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function listEmails(r: Registration): string {
  if (r.ownerHandles || r.owner.email === r.handler.email) {
    return r.owner.email
  }
  return [r.owner.email, r.handler.email].join(', ')
}

function useRegistrationEmailTemplateData(registration: Registration, event: Event, context: string, text: string) {
  const { t } = useTranslation()

  if (!registration || !event) {
    return {}
  }

  const eventDate = formatDateSpan(event.startDate, registration.language, { end: event.endDate })
  const reserveText = registration.reserve ? t(`registration.reserveChoises.${registration.reserve}`) : ''
  const dogBreed = registration.dog.breedCode ? t(`breed:${registration.dog.breedCode}`, 'breed') : ''
  const regDates = registration.dates
    .map((d) => t('dateFormat.short', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
    .join(', ')
  const link = Path.registration(registration)
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: t('dateFormat.date', { date: r.date }),
  }))
  const groupDate = registration.group?.date ? t('dateFormat.wdshort', { date: registration.group.date }) : ''
  const groupTime = registration.group?.time ? t(`registration.timeLong.${registration.group.time}`) : ''

  return {
    subject: t('registration.email.subject', { context }),
    title: t('registration.email.title', { context }),
    dogBreed,
    link,
    event: {
      ...event,
      // Friendly name for secretary (and official) (KOE-350)
      secretary: { ...event.secretary, name: reverseName(event.secretary.name) },
      official: { ...event.official, name: reverseName(event.official.name) },
    },
    eventDate,
    qualifyingResults,
    reg: registration,
    regDates,
    reserveText,
    groupDate,
    groupTime,
    text,
  }
}

function reverseName(name: string) {
  const [last = '', first = ''] = name.split(' ')
  return `${first} ${last}`.trim()
}

import type { ConfirmedEvent, EmailTemplate, EmailTemplateId, Language, Registration } from '../../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowForwardIosSharp from '@mui/icons-material/ArrowForwardIosSharp'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// @ts-expect-error handlebars 4.8 should fix this issue
import Handlebars from 'handlebars/dist/cjs/handlebars.js'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'
import { useRecoilValue, useSetRecoilState } from 'recoil'

import { sendTemplatedEmail } from '../../../api/email'
import { useRegistrationEmailTemplateData } from '../../../hooks/useRegistrationEmailTemplateData'
import { AsyncButton } from '../../components/AsyncButton'
import AutocompleteSingle from '../../components/AutocompleteSingle'
import { accessTokenAtom } from '../../recoil'
import { adminEmailTemplatesAtom, adminEventSelector } from '../recoil'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import ContactInfoGroup from './sendMessageDialog/ContactInfoGroup'

interface Props {
  readonly registrations: Registration[]
  readonly templateId?: EmailTemplateId
  readonly open: boolean
  readonly event: ConfirmedEvent
  readonly onClose?: () => void
}

const CONTACT_INFO_GROUPS = ['secretary', 'official'] as const

export default function SendMessageDialog({ event, registrations, templateId, open, onClose }: Props) {
  const confirm = useConfirm()
  const { i18n, t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const [contactInfo, setContactInfo] = useState(event.contactInfo)
  const [text, setText] = useState('')
  const token = useRecoilValue(accessTokenAtom)
  const templates = useRecoilValue(adminEmailTemplatesAtom)
  const actions = useAdminRegistrationActions(event.id)
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
  const previewData = useRegistrationEmailTemplateData(registrations[0], { ...event, contactInfo }, '', text)

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

  const handleSend = useCallback(async () => {
    if (!selectedTemplate) {
      return
    }
    try {
      const { confirmed } = await confirm({
        title: 'Viestin lähettäminen',
        content: (
          <div>
            Olet lähettämässä viestiä {t(`emailTemplate.${selectedTemplate.id}`)} {registrations.length}{' '}
            ilmoittautumiseen.
            <br />
            Oletko varma, että haluat lähettää viestin?
          </div>
        ),
        confirmationText: 'Lähetä',
        cancellationText: t('cancel'),
      })
      if (!confirmed) return

      const {
        ok = [],
        failed = [],
        state = event.state,
        classes = event.classes,
        registrations: updatedRegistrations,
      } = await sendTemplatedEmail(
        {
          template: selectedTemplate.id,
          eventId: event.id,
          contactInfo,
          registrationIds: registrations.map<string>((r) => r.id),
          text,
        },
        token
      )
      if (ok.length) {
        enqueueSnackbar('Viesti lähetetty onnistuneesti\n\n' + ok.join('\n'), {
          variant: 'success',
          style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
        })
      }
      if (failed.length) {
        enqueueSnackbar('Viestin lähetys epäonnistui 💩\n\n' + failed.join('\n'), {
          variant: 'success',
          style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' },
        })
      }
      setEvent({ ...event, state, classes })
      actions.update(updatedRegistrations)
      onClose?.()
    } catch (error) {
      enqueueSnackbar('Viestin lähetys epäonnistui 💩', { variant: 'error' })
      console.log(error)
    }
  }, [
    actions,
    confirm,
    contactInfo,
    enqueueSnackbar,
    event,
    onClose,
    registrations,
    selectedTemplate,
    setEvent,
    t,
    text,
    token,
  ])

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
                disabled={!!templateId}
                getOptionLabel={(o) => (o ? t(`emailTemplate.${o.id}`) : '')}
                isOptionEqualToValue={(o, v) => o?.id === v?.id}
                options={templates}
                onChange={handleTemplateChange}
                label={'Viestin tyyppi'}
                value={selectedTemplate}
              />
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Voit lisätä tähän halutessasi lisäviestin:</FormLabel>
                <TextField fullWidth multiline rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </FormControl>
              <FormControl component="fieldset" sx={{ my: 1 }}>
                <FormLabel component="legend">Yhteystiedot:</FormLabel>
                <FormGroup sx={{ mx: 2, my: 1 }}>
                  {CONTACT_INFO_GROUPS.map((group) => (
                    <ContactInfoGroup
                      contactInfo={contactInfo}
                      event={event}
                      group={group}
                      key={group}
                      setContactInfo={setContactInfo}
                    />
                  ))}
                </FormGroup>
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
        <AsyncButton disabled={!selectedTemplate} variant="contained" onClick={handleSend}>
          Lähetä
        </AsyncButton>
        <Button variant="outlined" onClick={onClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function listEmails(r: Registration): string {
  if (r.ownerHandles || r.owner?.email === r.handler?.email) {
    return r.owner?.email ?? ''
  }
  return [r.owner?.email, r.handler?.email].filter(Boolean).join(', ')
}

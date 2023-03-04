import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckBox } from '@mui/icons-material'
import {
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
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { lightFormat } from 'date-fns'
// @ts-ignore handlebars 4.8 should fix this issue
import Handlebars from 'handlebars/dist/cjs/handlebars.js'
import { EmailTemplate, EmailTemplateId, Event, Language, Registration } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import AutocompleteSingle from '../../components/AutocompleteSingle'
import { emailTemplatesAtom } from '../recoil'

interface Props {
  registrations: Registration[]
  templateId?: EmailTemplateId
  open: boolean
  event: Event
  onClose?: () => void
}

export default function SendMessageDialog({ event, registrations, templateId, open, onClose }: Props) {
  const { i18n, t } = useTranslation()
  const templates = useRecoilValue(emailTemplatesAtom)
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
  const previewData = useMemo(() => {
    const reg = registrations[0]
    if (!reg) {
      return {}
    }
    return {
      subject: t('registration.email.subject', { context: '' }),
      title: t('registration.email.title', { context: '' }),
      link: `/registration/${reg.eventType}/${reg.eventId}/${reg.id}`,
      event,
      eventDate: t('daterange', { start: event.startDate, end: event.endDate }),
      reg,
      regDates: reg.dates
        .map((d) => t('dateFormat.weekday', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
        .join(', '),
      dogBreed: reg.dog.breedCode ? t(`breed:${reg.dog.breedCode}`, 'breed') : '',
      qualifyingResults: reg.qualifyingResults.map((r) => ({ ...r, date: lightFormat(r.date, 'd.M.yyyy') })),
      reserveText: reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : t(`registration.reserveChoises.ANY`),
    }
  }, [event, registrations, t])

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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Viestin lähettäminen</DialogTitle>
      <DialogContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ width: '40%' }}>
            <Typography variant="h5">Viesti</Typography>

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
                <TextField fullWidth multiline rows={4} />
              </FormControl>
            </Paper>
          </Box>
          <Box sx={{ width: '60%' }}>
            <Typography variant="h5">Esikatselu</Typography>
            <Paper sx={{ width: '100%', p: 1 }}>
              Aihe:&nbsp;{preview.subject}
              <div className="preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </Paper>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained">Lähetä</Button>
        <Button variant="outlined" onClick={onClose}>
          Peruuta
        </Button>
      </DialogActions>
    </Dialog>
  )
}

import type { EmailTemplate, Language } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { adminEmailTemplatesAtom, adminEventsAtom } from '../state'
import SendMessageDialog from './SendMessageDialog'

const registrationTemplate: EmailTemplate = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: 'test',
  en: '',
  fi: '',
  id: 'registration',
  modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  modifiedBy: 'test',
  ses: {
    en: {
      HtmlPart: '<h1>{{reg.dog.name}}</h1>',
      SubjectPart: 'Registration {{reg.eventType}}',
      TemplateName: 'registration-en',
      TextPart: '',
    },
    fi: {
      HtmlPart: '<h1>{{reg.dog.name}}</h1>',
      SubjectPart: 'Ilmoittautuminen {{reg.eventType}}',
      TemplateName: 'registration-fi',
      TextPart: '',
    },
  },
}

/** The dialog over the recipients, one by default, with the registration template to preview. */
const renderDialog = (language: Language = 'fi', registrations = [registrationWithStaticDates]) =>
  render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEmailTemplatesAtom, [registrationTemplate])
            set(adminEventsAtom, [eventWithStaticDates])
          }}
        >
          <AppSnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<div>loading...</div>}>
                <SendMessageDialog
                  registrations={registrations}
                  open
                  event={eventWithStaticDates}
                  templateId="registration"
                />
              </Suspense>
            </ConfirmProvider>
          </AppSnackbarProvider>
        </TestProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

it('shows the recipient and a rendered template preview', async () => {
  const screen = await renderDialog()

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByText('Vastaanottajat: 1')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('send-message-dialog-open')
})

// Recipients picked VOI first still name their classes as ALO, AVO, VOI (KOE-1596).
it('names the recipient classes as ALO, AVO, VOI whatever order they were selected in (KOE-1596)', async () => {
  const screen = await renderDialog('fi', [
    { ...registrationWithStaticDates, class: 'VOI', id: 'voi' },
    { ...registrationWithStaticDates, class: 'ALO', id: 'alo' },
  ])

  await expect.element(screen.getByText('Luokat: ALO, VOI')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('send-message-dialog-class-order')
})

// The guide's English page shows the dialog in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows the recipient and a rendered template preview', async () => {
    const screen = await renderDialog('en')

    await expect.element(screen.getByText('Recipients: 1')).toBeVisible()
    await expect(screen.getByRole('dialog')).toMatchScreenshot('send-message-dialog-open-en')
  })
})

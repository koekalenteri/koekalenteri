import type { EmailTemplate } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TestProvider } from '@/test-utils/AtomProvider'
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

it('shows the recipient and a rendered template preview', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEmailTemplatesAtom, [registrationTemplate])
            set(adminEventsAtom, [eventWithStaticDates])
          }}
        >
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<div>loading...</div>}>
                <SendMessageDialog
                  registrations={[registrationWithStaticDates]}
                  open
                  event={eventWithStaticDates}
                  templateId="registration"
                />
              </Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </TestProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect.element(screen.getByText('Vastaanottajat: 1')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('send-message-dialog-open')
})

import type { ReactNode } from 'react'
import type { EmailTemplate, Registration } from '../../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../../__mockData__/events'
import {
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
  registrationWithStaticDatesCancelled,
} from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises } from '../../../test-utils/utils'
import { idTokenAtom } from '../../recoil'
import { adminEmailTemplatesAtom, adminEventsAtom } from '../recoil'
import SendMessageDialog from './SendMessageDialog'

jest.mock('../../../api/email')
jest.mock('../../../api/event')
jest.mock('../../../api/registration')
jest.mock('../recoil/emailTemplates/effects', () => ({
  adminRemoteEmailTemplatesEffect: () => undefined,
}))
jest.mock('../recoil/events/effects', () => ({
  adminRemoteEventsEffect: () => undefined,
}))

const registrationTemplate: EmailTemplate = {
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  createdBy: 'test',
  en: '',
  fi: '',
  id: 'registration',
  modifiedAt: new Date('2023-01-01T00:00:00.000Z'),
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

const invitationTemplate: EmailTemplate = {
  ...registrationTemplate,
  id: 'invitation',
}

const createWrapper =
  ({ emailTemplates = [] }: { readonly emailTemplates?: EmailTemplate[] } = {}) =>
  ({ children }: { readonly children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <RecoilRoot
        initializeState={({ set }) => {
          set(adminEmailTemplatesAtom, emailTemplates)
          set(adminEventsAtom, [eventWithStaticDates])
          set(idTokenAtom, 'id-token')
        }}
      >
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <SnackbarProvider>
            <ConfirmProvider>
              <Suspense fallback={<>loading...</>}>{children}</Suspense>
            </ConfirmProvider>
          </SnackbarProvider>
        </LocalizationProvider>
      </RecoilRoot>
    </ThemeProvider>
  )

describe('SendMessageDialog', () => {
  let consoleError: jest.SpiedFunction<typeof console.error>

  beforeAll(() => jest.useFakeTimers())
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
    jest.runOnlyPendingTimers()
  })
  afterAll(() => jest.useRealTimers())

  it('renders hidden when open is false', async () => {
    const { container } = render(<SendMessageDialog registrations={[]} open={false} event={eventWithStaticDates} />, {
      wrapper: createWrapper(),
    })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with minimal parameters', async () => {
    const { baseElement } = render(<SendMessageDialog registrations={[]} open={true} event={eventWithStaticDates} />, {
      wrapper: createWrapper(),
    })
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('renders with all parameters', async () => {
    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled]

    const { baseElement } = render(
      <SendMessageDialog
        registrations={registrations}
        open={true}
        event={eventWithStaticDates}
        templateId="registration"
      />,
      { wrapper: createWrapper() }
    )
    await flushPromises()
    expect(baseElement).toMatchSnapshot()
  })

  it('shows the recipient class explicitly', async () => {
    render(
      <SendMessageDialog
        registrations={[registrationWithStaticDatesAndClass]}
        open={true}
        event={eventWithStaticDatesAndClass}
      />,
      { wrapper: createWrapper() }
    )
    await flushPromises()

    expect(screen.getByText('Luokka: ALO')).toBeInTheDocument()
  })

  it('renders a selected template preview when templates are loaded', async () => {
    const { baseElement } = render(
      <SendMessageDialog
        registrations={[registrationWithStaticDates]}
        open={true}
        event={eventWithStaticDates}
        templateId="registration"
      />,
      { wrapper: createWrapper({ emailTemplates: [registrationTemplate] }) }
    )
    await flushPromises()

    expect(screen.getByRole('button', { name: 'Lähetä' })).toBeEnabled()
    expect(baseElement).toHaveTextContent(/Aihe:\s*Ilmoittautuminen NOU/)
    expect(screen.getByRole('heading', { name: registrationWithStaticDates.dog.name })).toBeInTheDocument()
  })

  it('shows the event invitation attachment when sending invitations', async () => {
    render(
      <SendMessageDialog
        registrations={[registrationWithStaticDates]}
        open={true}
        event={{ ...eventWithStaticDates, invitationAttachment: 'common-attachment' }}
        templateId="invitation"
      />,
      { wrapper: createWrapper({ emailTemplates: [invitationTemplate] }) }
    )
    await flushPromises()

    expect(screen.getByRole('heading', { name: 'Liitetiedosto' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'koekutsu-20210210-NOU.pdf' })).toHaveAttribute(
      'href',
      expect.stringContaining('/file/common-attachment/koekutsu-20210210-NOU.pdf')
    )
  })

  it('shows the class-specific invitation attachment instead of the common attachment', async () => {
    render(
      <SendMessageDialog
        registrations={[registrationWithStaticDatesAndClass]}
        open={true}
        event={{
          ...eventWithStaticDatesAndClass,
          invitationAttachment: 'common-attachment',
          invitationAttachments: { ALO: 'alo-attachment' },
        }}
        templateId="invitation"
      />,
      { wrapper: createWrapper({ emailTemplates: [invitationTemplate] }) }
    )
    await flushPromises()

    expect(screen.getByRole('link', { name: 'koekutsu-20210210-NOME-B-ALO.pdf' })).toHaveAttribute(
      'href',
      expect.stringContaining('/file/alo-attachment/koekutsu-20210210-NOME-B-ALO.pdf')
    )
  })

  it('shows when an invitation has no attachment', async () => {
    render(
      <SendMessageDialog
        registrations={[registrationWithStaticDates]}
        open={true}
        event={eventWithStaticDates}
        templateId="invitation"
      />,
      { wrapper: createWrapper({ emailTemplates: [invitationTemplate] }) }
    )
    await flushPromises()

    expect(screen.getByText('Ei liitettyä tiedostoa')).toBeInTheDocument()
  })
})

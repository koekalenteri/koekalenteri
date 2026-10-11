import type { AuditRecord } from '@/types'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import theme from '@/assets/Theme'
import { i18nInitOptions } from '@/i18n/config'
import { renderWithUserEvents } from '@/test-utils/utils'
import { AuditTrail } from './AuditTrail'

vi.unmock('react-i18next')

i18n.use(initReactI18next).init(i18nInitOptions())

const auditRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  auditKey: 'event:test-event',
  message: 'Koekutsu luokkaan ALO lähetetty: onnistui 1, epäonnistui 0',
  messageKey: 'audit.messages.classEmailSent',
  messageParams: {
    eventClass: 'ALO',
    failed: 0,
    ok: 1,
    template: 'Koekutsu',
    templateKey: 'emailTemplate.invitation',
  },
  timestamp: new Date('2026-08-04T10:30:00.000Z'),
  user: 'Testikäyttäjä',
  ...overrides,
})

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
)

describe('AuditTrail', () => {
  it('does not render without an audit trail', () => {
    const { container } = render(<AuditTrail auditTrail={undefined} />, { wrapper: Wrapper })

    expect(container).toBeEmptyDOMElement()
  })

  it('formats class-specific email messages', () => {
    render(<AuditTrail auditTrail={[auditRecord()]} fullHeight />, { wrapper: Wrapper })

    // The stored message rides along as the default, for a key this bundle does not have.
    expect(
      screen.getByText('audit.messages.classEmailSent eventClass, failed, ok, template, templateKey, defaultValue')
    ).toBeInTheDocument()
    expect(screen.getByText(/04\.08\.2026 13:30:00 Testikäyttäjä/)).toBeInTheDocument()
  })

  it('shows the stored message for a key outside the audit translations', () => {
    render(<AuditTrail auditTrail={[auditRecord({ message: 'Tallennettu teksti', messageKey: 'x' })]} fullHeight />, {
      wrapper: Wrapper,
    })

    expect(screen.getByText('Tallennettu teksti')).toBeInTheDocument()
  })

  it('names the groups of a move from their parts (KOE-1442)', () => {
    render(
      <AuditTrail
        auditTrail={[
          auditRecord({
            message: 'Ryhmä: la 7.11. ip #2 -> Ilmoittautuneet #1',
            messageKey: 'audit.messages.groupChanged',
            messageParams: {
              fromDate: '2026-11-07',
              fromNumber: 2,
              fromTimeKey: 'audit.time.ip',
              toGroupKey: 'eventManagement.participantSelection.registered',
              toNumber: 1,
            },
          }),
        ]}
        fullHeight
      />,
      { wrapper: Wrapper }
    )

    // A move without a reason still hands the translation one, or it would print the placeholder.
    expect(
      screen.getByText(
        'audit.messages.groupChanged fromDate, fromNumber, fromTimeKey, toGroupKey, toNumber, fromTime, toGroup, from, reason, to, defaultValue'
      )
    ).toBeInTheDocument()
  })

  it('marks a name taken from the registration rather than a login', () => {
    render(
      <AuditTrail auditTrail={[auditRecord({ user: 'Maksaja Malli', userSource: 'registration' })]} fullHeight />,
      { wrapper: Wrapper }
    )

    expect(screen.getByText(/04\.08\.2026 13:30:00 Maksaja Malli audit\.userSource\.registration/)).toBeInTheDocument()
  })

  it('shows failed recipients when audit details are expanded', async () => {
    const { user } = renderWithUserEvents(
      <AuditTrail
        auditTrail={[
          auditRecord({
            details: [
              {
                detailKey: 'audit.details.failedRecipients',
                detailParams: { recipients: 'handler@example.com' },
              },
            ],
            message: 'Koekutsu luokkaan ALO lähetetty: onnistui 0, epäonnistui 1',
            messageParams: {
              eventClass: 'ALO',
              failed: 1,
              ok: 0,
              template: 'Koekutsu',
              templateKey: 'emailTemplate.invitation',
            },
          }),
        ]}
        fullHeight
      />,
      { wrapper: Wrapper }
    )

    expect(screen.queryByText(/audit\.details\.failedRecipients/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'audit.showDetails' }))

    expect(screen.getByText('audit.details.failedRecipients recipients, defaultValue')).toBeInTheDocument()
  })
})

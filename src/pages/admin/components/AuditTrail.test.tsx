import type { AuditRecord } from '../../../types'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import theme from '../../../assets/Theme'
import { i18nInit } from '../../../i18n/config'
import { renderWithUserEvents } from '../../../test-utils/utils'
import { AuditTrail } from './AuditTrail'

vi.unmock('react-i18next')

i18n.use(initReactI18next).init(i18nInit)

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

    expect(
      screen.getByText('audit.messages.classEmailSent eventClass, failed, ok, template, templateKey')
    ).toBeInTheDocument()
    expect(screen.getByText(/04\.08\.2026 13:30:00 Testikäyttäjä/)).toBeInTheDocument()
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

    expect(screen.getByText('audit.details.failedRecipients recipients')).toBeInTheDocument()
  })
})

import type { AuditRecord } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { AuditTrail } from './AuditTrail'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 520 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// A participant's own trail as the secretary sees it: the payment and the confirmation email named
// from the registration's people, the group move by the payment workflow, the entry itself named
// from the registration, and an organizer's edit with a real login above them all (KOE-1417).
const rows: AuditRecord[] = [
  {
    auditKey: 'event-1:reg-1',
    changes: [
      {
        field: 'notes',
        labelKey: 'registration.notes',
        next: { text: 'Koira on arka laukauksille' },
        previous: { state: 'empty' },
      },
    ],
    message: 'Muutti: Lisätiedot',
    messageKey: 'audit.changed',
    timestamp: new Date('2026-09-12T11:40:02.000Z'),
    user: 'Sihteeri Sirpa',
  },
  {
    auditKey: 'event-1:reg-1',
    message: 'Email: Ilmoittautumisen vahvistus, to: jukka@example.com',
    timestamp: new Date('2026-09-12T08:37:14.000Z'),
    user: 'Jukka Kurkela',
    userSource: 'registration',
  },
  {
    auditKey: 'event-1:reg-1',
    message: 'Ryhmä: Ilmoittautuneet #1 (automaattinen sijoitus)',
    timestamp: new Date('2026-09-12T08:37:14.000Z'),
    user: 'payment',
  },
  {
    auditKey: 'event-1:reg-1',
    message: 'Maksu (Nordea), 150,00 €',
    timestamp: new Date('2026-09-12T08:37:14.000Z'),
    user: 'Jukka Kurkela',
    userSource: 'registration',
  },
  {
    auditKey: 'event-1:reg-1',
    message: 'Ilmoittautui',
    timestamp: new Date('2026-09-12T08:36:59.000Z'),
    user: 'Jukka Kurkela',
    userSource: 'registration',
  },
]

it('tells a name taken from the registration from a login', async () => {
  const screen = await render(
    <Frame>
      <AuditTrail auditTrail={rows} fullHeight />
    </Frame>
  )

  await expect.element(screen.getByText('Ilmoittautui')).toBeVisible()

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('audit-trail-user-sources')
})

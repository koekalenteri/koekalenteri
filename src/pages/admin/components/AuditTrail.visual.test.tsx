import type { AuditRecord } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { parseDateOnlyString } from '@/lib/utils'
import { describeInLanguage } from '@/test-utils/language'
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

// The rows a registration's trail is made of since KOE-1442: each names its message by a key and
// carries the parts as parameters, so the trail reads in the secretary's language, and stores no
// Finnish `message` beside them (KOE-1511).
const keyedRows: AuditRecord[] = [
  {
    auditKey: 'event-1:reg-1',
    messageKey: 'audit.messages.startNumberReleased',
    messageParams: { number: 2 },
    timestamp: new Date('2026-09-21T17:55:06.000Z'),
    user: 'Minsu Rauramo',
  },
  {
    auditKey: 'event-1:reg-1',
    messageKey: 'audit.messages.groupChanged',
    // As the API hands it over: its JSON reviver turns the bare day into a Date.
    messageParams: {
      fromDate: parseDateOnlyString('2026-11-07'),
      fromNumber: 2,
      fromTimeKey: 'audit.time.ip',
      reasonKey: 'audit.groupReason.move',
      toGroupKey: 'eventManagement.participantSelection.registered',
      toNumber: 1,
    },
    timestamp: new Date('2026-09-21T17:54:48.000Z'),
    user: 'Minsu Rauramo',
  },
  {
    auditKey: 'event-1:reg-1',
    messageKey: 'audit.messages.emailSentTo',
    messageParams: { recipients: 'minsu@example.com', templateKey: 'emailTemplate.invitation' },
    timestamp: new Date('2026-08-04T17:00:10.000Z'),
    user: 'Minsu Rauramo',
  },
  {
    auditKey: 'event-1:reg-1',
    messageKey: 'audit.messages.registrationCancelled',
    messageParams: { reasonKey: 'registration.cancelReason.dog-heat' },
    timestamp: new Date('2026-08-04T16:59:59.000Z'),
    user: 'Minsu Rauramo',
  },
  {
    auditKey: 'event-1:reg-1',
    messageKey: 'audit.messages.payment',
    messageParams: { amount: '19,00 €', provider: 'Nordea' },
    timestamp: new Date('2026-08-04T16:58:29.000Z'),
    user: 'Minsu Rauramo',
    userSource: 'registration',
  },
]

describeInLanguage('en', () => {
  it('reads a registration trail in English (KOE-1442)', async () => {
    const screen = await render(
      <Frame>
        <AuditTrail auditTrail={keyedRows} fullHeight />
      </Frame>
    )

    await expect.element(screen.getByText('Start number released: 2')).toBeVisible()
    await expect.element(screen.getByText('Group: Sat 7.11. pm #2 -> Registered #1 move')).toBeVisible()
    await expect.element(screen.getByText('Email: Invitation, to: minsu@example.com')).toBeVisible()
    await expect.element(screen.getByText('Registration cancelled, reason: The dog being in heat')).toBeVisible()
    await expect.element(screen.getByText('Payment (Nordea), 19,00 €')).toBeVisible()

    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('audit-trail-keyed-messages-en')
  })
})

import type { ComponentProps } from 'react'
import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { describeInLanguage } from '@/test-utils/language'
import { KennelliittoHandOverDialog } from './KennelliittoHandOverDialog'
import { KennelliittoSendDialog } from './KennelliittoSendDialog'

const noop = () => {}

const dog = (
  id: string,
  name: string,
  status: KcDogReport['status'],
  problems: KcDogReport['problems'] = []
): KcDogReport => ({
  id,
  name,
  problems,
  regNo: `FI${id}/21`,
  status,
})

// A screenful as the preview finds it: two to send, one already sent, and two the mapping refuses.
const preview: KcPreviewResponse = {
  blockers: [],
  dogs: [
    dog('10001', 'Hukka', 'ready'),
    dog('10002', 'Rölli', 'changed'),
    dog('10003', 'Musti', 'unchanged'),
    dog('10004', 'Peni', 'blocked', [{ code: 'judgeWithoutNumber', detail: 'Ulkomaalainen Tuomari' }]),
    dog('10005', 'Nelli', 'blocked', [{ code: 'resultNotAllowed', detail: 'NOME-A1' }]),
  ],
}

const sendProps: ComponentProps<typeof KennelliittoSendDialog> = {
  eventClass: 'AVO',
  force: false,
  onClose: noop,
  onForce: noop,
  onScope: noop,
  onSend: noop,
  open: true,
  phase: { kind: 'preview', preview },
  scope: 'class',
}

// The dialogs render through a portal, so a capture is the dialog itself.
const shoot = async (ui: React.ReactNode, ready: string, name: string) => {
  await page.viewport(900, 900)
  const screen = await render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
  await expect.element(screen.getByText(ready)).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot(name)
}

it('asks before sending, lists the dogs that cannot be sent and why (KOE-1140)', async () => {
  await shoot(<KennelliittoSendDialog {...sendProps} />, 'Tulosten lähetys Omakoiraan', 'kennelliitto-send-preview')
})

it('says what stops the whole trial and offers no sending', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        kind: 'preview',
        preview: { blockers: [{ code: 'stateNotWritable', detail: 'Valmistunut' }], dogs: [] },
      }}
    />,
    'Tulosten lähetys Omakoiraan',
    'kennelliitto-send-blocked'
  )
})

it('reports who was saved and who was refused, with Kennelliitto’s own words', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        kind: 'report',
        summary: {
          blockers: [],
          interrupted: false,
          notAttempted: ['10009'],
          reports: [
            { id: '10001', name: 'Hukka', outcome: 'sent', regNo: 'FI10001/21' },
            { id: '10002', name: 'Rölli', outcome: 'sent', regNo: 'FI10002/21' },
            {
              errors: ['Koiran nimi ei täsmää rekisterin kanssa.'],
              id: '10004',
              name: 'Peni',
              outcome: 'failed',
              regNo: 'FI10004/21',
              status: 400,
            },
            { id: '10005', name: 'Nelli', outcome: 'failed', regNo: 'FI10005/21', status: 0 },
          ],
        },
      }}
    />,
    'Tulokset on tallennettu Omakoiraan 2 koiralle',
    'kennelliitto-send-report'
  )
})

it('asks for the hand-over by saying what it means, and lists the dogs that stay out', async () => {
  await shoot(
    <KennelliittoHandOverDialog
      accepted={false}
      onAccept={noop}
      onClose={noop}
      onHandOver={noop}
      open
      outcome={{
        dogs: [
          dog('10004', 'Peni', 'blocked', [{ code: 'noJudge' }]),
          dog('10006', 'Tupu', 'notRecorded'),
          dog('10007', 'Mirri', 'sentGone'),
        ],
        kind: 'confirmationNeeded',
      }}
    />,
    'Tulosten luovutus ylituomarille',
    'kennelliitto-hand-over'
  )
})

describeInLanguage('en', () => {
  it('asks before sending, lists the dogs that cannot be sent and why', async () => {
    await shoot(
      <KennelliittoSendDialog {...sendProps} />,
      'Sending results to Omakoira',
      'kennelliitto-send-preview-en'
    )
  })
})

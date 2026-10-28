import type { ComponentProps } from 'react'
import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { toDayKey } from '@/lib/day'
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
    dog('10005', 'Nelli', 'blocked', [{ code: 'resultNotAllowed', detail: 'A1' }]),
  ],
}

const sendProps: ComponentProps<typeof KennelliittoSendDialog> = {
  decisions: {},
  force: false,
  onBack: noop,
  onClose: noop,
  onDecide: noop,
  onForce: noop,
  onSend: noop,
  open: true,
  phase: { kind: 'preview', preview },
}

// The dialogs render through a portal, so a capture is the dialog itself.
const shoot = async (ui: React.ReactNode, ready: string, name: string, height = 900) => {
  await page.viewport(900, height)
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

it('reports who was saved and who was refused with Kennelliitto’s own words, and the dogs it could not send (KOE-1656)', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        blocked: [dog('10008', 'Musti', 'blocked', [{ code: 'microchipInvalid', detail: '623372020' }])],
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
            { answerNotStored: true, id: '10007', name: 'Mirri', outcome: 'failed', regNo: 'FI10007/21' },
            {
              dogStatus: 'blocked',
              id: '10006',
              name: 'Tupu',
              outcome: 'skipped',
              problems: [{ code: 'dayChanged', detail: '26.9.2026' }],
              regNo: 'FI10006/21',
            },
          ],
        },
      }}
    />,
    'Tulokset on tallennettu Omakoiraan 2 koiralle',
    'kennelliitto-send-report'
  )
})

it('says the server failed, with its status, when it answered a sending with an error (KOE-1140)', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        blocked: [],
        kind: 'report',
        summary: {
          blockers: [],
          errorStatus: 500,
          interrupted: true,
          notAttempted: ['10001', '10002'],
          reports: [],
        },
      }}
    />,
    'Lähetys keskeytyi, koska palvelin vastasi virheellä (virhekoodi 500). Koirakohtainen tila on luettu palvelimelta ja näkyy taulukossa.',
    'kennelliitto-send-server-error'
  )
})

it('says which foreign dogs it adds to Kennelliitto first, and which it cannot (KOE-1201)', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        kind: 'preview',
        preview: {
          blockers: [],
          dogs: [
            dog('10001', 'Hukka', 'ready'),
            {
              ...dog('10002', 'Rölli', 'ready'),
              createsDog: { code: 'SE', name: 'Ruotsi' },
              regNo: 'SE12345/2024',
            },
            {
              ...dog('10003', 'Musti', 'blocked', [{ code: 'countryUnknown', detail: 'RI (MG, PT)' }]),
              regNo: 'RI1234/20',
            },
            {
              ...dog('10004', 'Peni', 'blocked', [
                { code: 'microchipInvalid', detail: '75209810012345' },
                { code: 'noBirthDate' },
              ]),
              regNo: 'NO12345/20',
            },
          ],
        },
      }}
    />,
    'Tulosten lähetys Omakoiraan',
    'kennelliitto-send-foreign-preview'
  )
})

it('says a foreign dog Kennelliitto did not add, with its reasons or without them (KOE-1201)', async () => {
  await shoot(
    <KennelliittoSendDialog
      {...sendProps}
      phase={{
        blocked: [],
        kind: 'report',
        summary: {
          blockers: [],
          interrupted: false,
          notAttempted: [],
          reports: [
            { id: '10001', name: 'Hukka', outcome: 'sent', regNo: 'FI10001/21' },
            {
              dogNotAdded: true,
              errors: ['Ei käyttöoikeutta.'],
              id: '10002',
              name: 'Rölli',
              outcome: 'failed',
              regNo: 'SE12345/2024',
              status: 403,
            },
            { dogNotAdded: true, id: '10005', name: 'Nelli', outcome: 'failed', regNo: 'NO12345/20', status: 500 },
          ],
        },
      }}
    />,
    'Tulokset on tallennettu Omakoiraan 1 koiralle',
    'kennelliitto-send-foreign-report'
  )
})

it('asks for the hand-over by saying what it means, and lists the dogs that stay out', async () => {
  await shoot(
    <KennelliittoHandOverDialog
      accepted={false}
      eventType="NOWT"
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

// A NOU awards no certificates, so its hand-over has no note about them (KOE-1644); the NOWT above has.
it('asks for the secretary’s word before it hands over a trial with nothing sent', async () => {
  await shoot(
    <KennelliittoHandOverDialog
      accepted={false}
      eventType="NOU"
      onAccept={noop}
      onClose={noop}
      onHandOver={noop}
      open
      outcome={{ kind: 'nothingSent' }}
    />,
    'Tulosten luovutus ylituomarille',
    'kennelliitto-hand-over-nothing'
  )
})

/**
 * Testi2, 27.10.2026: one dog Kennelliitto found by its microchip under a Finnish number, and one it
 * found by its name only, with no microchip and no birth date of its own (KOE-1653).
 */
const filurin = { ...dog('1', 'FILURIN PARADOX', 'ready'), regNo: 'SE22358/2021' }
const solveigh = { ...dog('2', 'SOLVEIGH NEVER TOUCHING GROUND', 'ready'), regNo: 'SE39800/2023' }
const regNoPhase: ComponentProps<typeof KennelliittoSendDialog>['phase'] = {
  kind: 'regNos',
  preview: { blockers: [], dogs: [filurin, solveigh] },
  rows: [
    {
      dog: {
        breedCode: '121',
        dob: toDayKey(2020, 3, 22),
        gender: 'F',
        name: 'FILURIN PARADOX',
        regNo: 'SE22358/2021',
        rfid: '981098106889342',
      },
      kcDog: {
        breedCode: '121',
        dob: toDayKey(2020, 3, 22),
        foundBy: 'microchip',
        gender: 'F',
        name: 'FILURIN PARADOX',
        regNo: 'FI25555/20',
        rfid: '981098106889342',
      },
      report: filurin,
    },
    {
      dog: {
        breedCode: '121',
        dob: toDayKey(2023, 5, 2),
        gender: 'F',
        name: 'SOLVEIGH NEVER TOUCHING GROUND',
        regNo: 'SE39800/2023',
        rfid: '756097201013080',
      },
      kcDog: {
        breedCode: '121',
        foundBy: 'name',
        gender: 'F',
        name: 'SOLVEIGH NEVER TOUCHING GROUND',
        regNo: 'SE39800/23',
        rfid: '',
      },
      report: solveigh,
    },
  ],
}

it('asks in one view what to do with the dogs Kennelliitto knows by another number (KOE-1653)', async () => {
  await shoot(
    <KennelliittoSendDialog {...sendProps} decisions={{ '1': 'switch' }} phase={regNoPhase} />,
    'Vahvista ja lähetä',
    'kennelliitto-send-regnos',
    1500
  )
})

describeInLanguage('en', () => {
  it('asks in one view what to do with the dogs Kennelliitto knows by another number', async () => {
    await shoot(
      <KennelliittoSendDialog {...sendProps} decisions={{ '1': 'switch' }} phase={regNoPhase} />,
      'Confirm and send',
      'kennelliitto-send-regnos-en',
      1500
    )
  })

  it('asks before sending, lists the dogs that cannot be sent and why', async () => {
    await shoot(
      <KennelliittoSendDialog {...sendProps} />,
      'Sending results to Omakoira',
      'kennelliitto-send-preview-en'
    )
  })
})

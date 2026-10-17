import type { EventKcIdChoice } from '@/api/event'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { TIME_ZONE } from '@/lib/day'
import KcIdChoiceDialog from './KcIdChoiceDialog'

const LINKED_GUID = '0a0b27bc-f651-4575-b0aa-b0b16a5ce52d'

// The shapes of the real Testi2 trials of 15.10.2026: one with a GUID, one already linked to another
// event of this system, and one Kennelliitto has not given a GUID yet.
const choices: EventKcIdChoice[] = [
  {
    classes: ['ALO', 'AVO'],
    endDate: new TZDate('2026-09-27', TIME_ZONE),
    eventType: 'NOU',
    judge: 'Testi Tuomari',
    kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
    location: 'Laukaa',
    name: '',
    organizer: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
    startDate: new TZDate('2026-09-26', TIME_ZONE),
    status: 'Hyväksytty',
  },
  {
    classes: [],
    endDate: new TZDate('2026-09-13', TIME_ZONE),
    eventType: 'NOU',
    judge: 'Toinen Tuomari',
    kcGuid: LINKED_GUID,
    location: 'Raasepori',
    name: '',
    organizer: 'UUDENMAAN NOUTAJAKOIRAYHDISTYS',
    startDate: new TZDate('2026-09-12', TIME_ZONE),
    status: 'Hyväksytty',
  },
  {
    classes: [],
    endDate: new TZDate('2026-09-05', TIME_ZONE),
    eventType: 'NOU',
    judge: 'Kolmas Tuomari',
    kcGuid: null,
    location: 'Heinola',
    name: '',
    organizer: 'PÄIJÄT-HÄMEEN NOUTAJAKOIRAYHDISTYS',
    startDate: new TZDate('2026-09-05', TIME_ZONE),
    status: 'Hyväksytty',
  },
]

// The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
it('lists the trials found, links the ones with a GUID and says why the others cannot be (KOE-1534)', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <KcIdChoiceDialog
        choices={choices}
        linkedKcGuids={new Set([LINKED_GUID])}
        onClose={() => undefined}
        onSelect={() => undefined}
      />
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Kennelliitto ei ole vielä antanut kokeelle tunnistetta')).toBeVisible()
  await expect.element(screen.getByText('Jo liitetty toiseen kokeeseen')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Valitse' })).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('kc-id-choice-dialog')
})

import type { EventKcIdChoice } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { describeInLanguage } from '@/test-utils/language'
import KcIdChoiceDialog from './KcIdChoiceDialog'

const LINKED_GUID = '0a0b27bc-f651-4575-b0aa-b0b16a5ce52d'

/** The narrowest screen the admin pages are made for: the entry grid needs it (KOE-1422). */
const NARROWEST_ADMIN = { height: 900, width: 1027 }

// The shapes of the real Testi2 trials of 15.10.2026: one with a GUID, one already linked to another
// event of this system, and one Kennelliitto has not given a GUID yet. The last is the trial of the
// KOE-1641 report, whose event type and day span both have a hyphen to break at.
const choices: EventKcIdChoice[] = [
  {
    classes: ['ALO', 'AVO'],
    endDate: '2026-09-27',
    eventType: 'NOU',
    judge: 'Testi Tuomari',
    kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
    location: 'Laukaa',
    name: '',
    organizer: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
    startDate: '2026-09-26',
    status: 'Hyväksytty',
  },
  {
    classes: [],
    endDate: '2026-09-13',
    eventType: 'NOU',
    judge: 'Toinen Tuomari',
    kcGuid: LINKED_GUID,
    location: 'Raasepori',
    name: '',
    organizer: 'UUDENMAAN NOUTAJAKOIRAYHDISTYS',
    startDate: '2026-09-12',
    status: 'Hyväksytty',
  },
  {
    classes: [],
    endDate: '2026-09-05',
    eventType: 'NOU',
    judge: 'Kolmas Tuomari',
    kcGuid: null,
    location: 'Heinola',
    name: '',
    organizer: 'PÄIJÄT-HÄMEEN NOUTAJAKOIRAYHDISTYS',
    startDate: '2026-09-05',
    status: 'Hyväksytty',
  },
  {
    classes: ['ALO', 'AVO', 'VOI'],
    endDate: '2026-08-09',
    eventType: 'NOME-B',
    judge: 'Neljäs Tuomari',
    kcGuid: null,
    location: 'Seinäjoki',
    name: '',
    organizer: 'LAKEUDEN NOUTAJAKOIRAYHDISTYS RY',
    startDate: '2026-08-08',
    status: 'Hyväksytty',
  },
  // The widest a row gets: a Koetunnus, Kennelliitto's free-text name of the trial, a long place and a long status.
  {
    classes: ['ALO', 'AVO', 'VOI'],
    endDate: '2026-10-11',
    eventType: 'NOU',
    judge: 'Viides Tuomari',
    kcGuid: null,
    kcTunnus: 'NOU-2026-0412',
    location: 'Hämeenlinna',
    name: 'Hämeen noutajien syyskoe ja mestaruus',
    organizer: 'HÄMEEN NOUTAJAKOIRAYHDISTYS RY',
    startDate: '2026-10-10',
    // Kennelliitto's free text: the longest status the app knows (code 1253).
    status: 'Ylituomarin hyväksyttäväksi',
  },
]

/** The Koe column, where only the event type, the cell's first text, is kept on one line. */
const KOE_COLUMN = 1

/**
 * The most lines each column may take, by column index. A short value (Koetunnus, Koe, Luokat, Aika)
 * is read at a glance only on one line, and the action column holds the Valitse button alone.
 * Paikka, Järjestäjä and Kennelliitto's free-text Tila may wrap. In the Koe column the limit is the
 * event type's: Kennelliitto's free-text name after it may wrap. The reason a trial cannot be chosen
 * is a row of its own under the trial, one cell across all the columns, so it is index 0 and on one
 * line too (KOE-1641).
 */
const MAX_LINES = new Map([
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [7, 1],
])

/** The text nodes in an element, in document order. */
const textNodes = (element: Element): Text[] => {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) nodes.push(node)
  }
  return nodes
}

/**
 * How many lines the text is laid out on: the distinct tops of its line boxes. A space the line
 * breaks at gets an empty box of its own, which is no line.
 */
const lineCount = (nodes: Text[]): number => {
  const tops = new Set<number>()
  for (const node of nodes) {
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (rect.width > 0) tops.add(Math.round(rect.top))
    }
  }
  return tops.size
}

/** The cells that take more lines than their column may, as readable lines for the failure. */
const wrappedCells = (rows: Element[]): string[] =>
  rows.flatMap((row, rowIndex) =>
    Array.from(row.children).flatMap((cell, column) => {
      const nodes = textNodes(cell)
      const lines = lineCount(column === KOE_COLUMN ? nodes.slice(0, 1) : nodes)
      const limit = MAX_LINES.get(column) ?? Number.POSITIVE_INFINITY
      return lines > limit ? [`row ${rowIndex} column ${column} "${cell.textContent}": ${lines} lines`] : []
    })
  )

/**
 * How far the table reaches past the dialog's content box. Anything over 0 scrolls sideways and
 * hides the Valitse button at the right edge.
 */
const overflow = (table: Element): number => {
  const content = table.parentElement
  return content ? content.scrollWidth - content.clientWidth : Number.POSITIVE_INFINITY
}

/** The dialog with every fixture trial, at the narrowest admin screen. */
const renderDialog = async () => {
  await page.viewport(NARROWEST_ADMIN.width, NARROWEST_ADMIN.height)

  return render(
    <ThemeProvider theme={theme}>
      <KcIdChoiceDialog
        choices={choices}
        linkedKcGuids={new Set([LINKED_GUID])}
        onClose={() => undefined}
        onSelect={() => undefined}
      />
    </ThemeProvider>
  )
}

// The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
it('lists the trials found, links the ones with a GUID and says why the others cannot be (KOE-1534)', async () => {
  const screen = await renderDialog()

  await expect.element(screen.getByText('Kennelliitto ei ole vielä antanut kokeelle tunnistetta').first()).toBeVisible()
  await expect.element(screen.getByText('Jo liitetty toiseen kokeeseen')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Valitse' })).toBeVisible()

  // Every row, the header too, at the narrowest admin screen, and all of it inside the dialog (KOE-1641).
  expect(wrappedCells(screen.getByRole('dialog').getByRole('row').elements())).toEqual([])
  expect(overflow(screen.getByRole('table').element())).toBe(0)

  await expect(screen.getByRole('dialog')).toMatchScreenshot('kc-id-choice-dialog')
})

// The English headers and reasons are longer than the Finnish ones, and the short columns do not wrap.
describeInLanguage('en', () => {
  it('fits the table in the dialog in English too (KOE-1641)', async () => {
    const screen = await renderDialog()

    await expect.element(screen.getByRole('button', { name: 'Select' })).toBeVisible()
    expect(wrappedCells(screen.getByRole('dialog').getByRole('row').elements())).toEqual([])
    expect(overflow(screen.getByRole('table').element())).toBe(0)
  })
})

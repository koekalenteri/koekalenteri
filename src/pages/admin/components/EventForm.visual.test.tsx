import type { ConfirmedEvent } from '../../../types'
import { TZDate } from '@date-fns/tz'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../../../__mockData__/emptyEvent'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { TIME_ZONE } from '../../../i18n/dates'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { adminEventTypesAtom, adminJudgesAtom, adminOrganizersAtom, adminUsersAtom } from '../state'
import EventForm from './EventForm'

// A phone's width; the height is whatever the whole form takes, since the capture stops at the viewport's edge.
const PHONE = { height: 1400, width: 390 }

// The sections slide open; a capture mid-slide is not a layout anyone gets.
const stillTheme = createTheme(theme, { transitions: { getAutoHeightDuration: () => 0 } })

const day = (iso: string) => new TZDate(iso, TIME_ZONE)

/** A trial still ahead, so the form is editable: a past one locks itself. */
const event: ConfirmedEvent = {
  ...emptyEvent,
  classes: [
    { class: 'ALO', date: day('2026-10-10') },
    { class: 'AVO', date: day('2026-10-10') },
    { class: 'VOI', date: day('2026-10-11') },
  ],
  cost: 45,
  costMember: 40,
  endDate: day('2026-10-11'),
  entryEndDate: day('2026-09-27'),
  entryStartDate: day('2026-09-01'),
  eventType: 'NOME-B',
  id: 'syyskoe',
  judges: [
    { id: 123, name: 'Tuomari 1', official: true },
    { id: 223, name: 'Tuomari 2', official: true },
  ],
  location: 'Hämeenlinna',
  name: 'Syyskoe',
  places: 30,
  startDate: day('2026-10-10'),
}

const eventTypes = [
  {
    active: true,
    createdAt: day('2020-01-01'),
    createdBy: 'test',
    description: { en: '', fi: '', sv: '' },
    eventType: 'NOME-B',
    modifiedAt: day('2020-01-01'),
    modifiedBy: 'test',
  },
]
const judges = [
  {
    active: true,
    district: 'Uusimaa',
    email: '',
    eventTypes: ['NOME-B'],
    id: 123,
    languages: [],
    location: 'Helsinki',
    name: 'Tuomari 1',
    phone: '',
  },
  {
    active: true,
    district: 'Häme',
    email: '',
    eventTypes: ['NOME-B'],
    id: 223,
    languages: [],
    location: 'Hämeenlinna',
    name: 'Tuomari 2',
    phone: '',
  },
]

/** The form on a phone, with the lists the pickers offer seeded so no field is emptier than it is in use. */
const renderOnPhone = async () => {
  await page.viewport(PHONE.width, PHONE.height)

  return render(
    <div data-testid="visual-root" style={{ background: '#fff', display: 'flex', width: PHONE.width }}>
      <ThemeProvider theme={stillTheme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider
            initializeState={({ set }) => {
              set(adminEventTypesAtom, eventTypes)
              set(adminJudgesAtom, judges)
              set(adminOrganizersAtom, [emptyEvent.organizer])
              set(adminUsersAtom, [])
            }}
          >
            <Suspense fallback={<div>loading...</div>}>
              <EventForm event={event} canSave />
            </Suspense>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )
}

describe('event form on a phone (KOE-271)', () => {
  it('opens with the basic details and the other sections folded', async () => {
    const screen = await renderOnPhone()

    await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-form-phone-basic')
  })

  it('shows one section at a time: opening the entry section folds the basic details', async () => {
    const screen = await renderOnPhone()
    await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).toBeVisible()

    await screen.getByText('Ilmoittautuminen', { exact: true }).click()

    await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).not.toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-form-phone-entry')
  })

  it('lists the judges one under another', async () => {
    const screen = await renderOnPhone()
    await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).toBeVisible()

    await screen.getByText('Tuomarit', { exact: true }).click()

    await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).not.toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-form-phone-judges')
  })
})

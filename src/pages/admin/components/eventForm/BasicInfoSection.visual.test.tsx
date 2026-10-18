import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import i18next from 'i18next'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TIME_ZONE } from '@/lib/day'
import { idTokenAtom } from '@/pages/state'
import { TestProvider } from '@/test-utils/AtomProvider'
import BasicInfoSection from './BasicInfoSection'
import { requiredFields, validateEventField } from './validation'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  </div>
)

it('shows a name field per language, Finnish first (KOE-1263)', async () => {
  // With the organizer chosen, as a trial is normally filled in, the secretary field asks for
  // nothing more (KOE-1473); the case without one has its own screenshot below.
  const organizer = { id: 'org1', name: 'Suomen Noutajakoirajärjestö ry' }
  const event = {
    classes: [],
    description: '',
    endDate: new TZDate('2026-06-02', TIME_ZONE),
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    names: { en: 'Spring trial' },
    organizer,
    startDate: new TZDate('2026-06-01', TIME_ZONE),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection event={event} open organizers={[organizer]} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).toBeVisible()
  await expect.element(screen.getByLabelText('Järjestäjä')).toHaveValue('Suomen Noutajakoirajärjestö ry')
  await expect
    .element(screen.getByText('Valitse ensin järjestäjä, niin voit valita koesihteerin yhdistyksen jäsenistä.'))
    .not.toBeInTheDocument()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-names')
})

it('lets a B-trial choose between game and dummies (KOE-439)', async () => {
  const event = {
    classes: [],
    description: '',
    endDate: new TZDate('2026-06-02', TIME_ZONE),
    eventType: 'NOME-B',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    retrieveType: 'game' as const,
    startDate: new TZDate('2026-06-01', TIME_ZONE),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection event={event} eventTypes={['NOME-B']} open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByRole('radio', { name: 'riistoilla' })).toBeChecked()
  await expect.element(screen.getByRole('radio', { name: 'dameilla' })).not.toBeChecked()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-retrieve-type')
})

it('asks a B-trial without the choice to make it (KOE-1570)', async () => {
  // Everything else a draft needs is there, so the choice is the one field asked for.
  const organizer = { id: 'org1', name: 'Suomen Noutajakoirajärjestö ry' }
  const secretary = { email: 'minsu@example.com', id: 'u1', name: 'Minsu Rauramo' }
  const event = {
    classes: [],
    description: '',
    endDate: new TZDate('2026-06-02', TIME_ZONE),
    eventType: 'NOME-B',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    organizer,
    secretary,
    startDate: new TZDate('2026-06-01', TIME_ZONE),
    state: 'draft' as const,
  }
  // The form's own validation, translated as EventForm translates it.
  const fields = requiredFields(event)
  const error = validateEventField(event, 'retrieveType', !!fields.required.retrieveType)
  if (!error) throw new Error('a B-trial without the choice should not validate')

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection
          errorStates={{ retrieveType: true }}
          event={event}
          eventTypes={['NOME-B']}
          fields={fields}
          helperTexts={{ retrieveType: i18next.t(`validation.event.${error.key}`, error.opts) }}
          open
          organizers={[organizer]}
          secretaries={[secretary]}
        />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByRole('radio', { name: 'riistoilla' })).not.toBeChecked()
  await expect.element(screen.getByRole('radio', { name: 'dameilla' })).not.toBeChecked()
  await expect.element(screen.getByText('Tila "Luonnos": Koe pidetään on vaadittu tieto.')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-retrieve-type-required')
})

it('lets a NOWT say it is a Mock trial, run in AVO and VOI (KOE-308)', async () => {
  const event = {
    classes: [
      { class: 'AVO' as const, date: new TZDate('2026-06-01', TIME_ZONE) },
      { class: 'VOI' as const, date: new TZDate('2026-06-01', TIME_ZONE) },
    ],
    description: '',
    endDate: new TZDate('2026-06-01', TIME_ZONE),
    eventType: 'NOWT',
    id: 'test',
    judges: [],
    mockTrial: true,
    name: 'Harjoituskoe',
    startDate: new TZDate('2026-06-01', TIME_ZONE),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection event={event} eventTypeClasses={{ NOWT: ['ALO', 'AVO', 'VOI'] }} eventTypes={['NOWT']} open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByRole('checkbox', { name: 'Mock trial' })).toBeChecked()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-mock-trial')
})

it('tells to choose the organizer before the secretary (KOE-1473)', async () => {
  const event = {
    classes: [],
    description: '',
    endDate: new TZDate('2026-06-02', TIME_ZONE),
    eventType: 'NOU',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    startDate: new TZDate('2026-06-01', TIME_ZONE),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection event={event} open secretaries={[]} />
      </Frame>
    </TestProvider>
  )

  await expect
    .element(screen.getByText('Valitse ensin järjestäjä, niin voit valita koesihteerin yhdistyksen jäsenistä.'))
    .toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-secretary-guidance')
})

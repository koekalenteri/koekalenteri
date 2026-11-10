import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import i18next from 'i18next'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { EVENT_TYPE_CLASSES } from '@/lib/event'
import { idTokenAtom } from '@/pages/state'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
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
    endDate: '2026-06-02' as const,
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    names: { en: 'Spring trial' },
    organizer,
    startDate: '2026-06-01' as const,
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
    endDate: '2026-06-02' as const,
    eventType: 'NOME-B',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    retrieveType: 'game' as const,
    startDate: '2026-06-01' as const,
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
    endDate: '2026-06-02' as const,
    eventType: 'NOME-B',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    organizer,
    secretary,
    startDate: '2026-06-01' as const,
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
      { class: 'AVO' as const, date: '2026-06-01' as const },
      { class: 'VOI' as const, date: '2026-06-01' as const },
    ],
    description: '',
    endDate: '2026-06-01' as const,
    eventType: 'NOWT',
    id: 'test',
    judges: [],
    mockTrial: true,
    name: 'Harjoituskoe',
    startDate: '2026-06-01' as const,
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
    endDate: '2026-06-02' as const,
    eventType: 'NOU',
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    startDate: '2026-06-01' as const,
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

describe('the official type an unofficial trial follows (KOE-1718)', () => {
  const event = {
    classes: [{ class: 'ALO' as const, date: '2026-06-01' as const }],
    description: '',
    endDate: '2026-06-01' as const,
    eventType: 'WT-harjoitus',
    id: 'test',
    judges: [],
    name: 'Harjoitus-WT',
    officialFormat: 'NOWT' as const,
    startDate: '2026-06-01' as const,
  }
  const selectedEventType = {
    active: true,
    description: { en: 'Training WT', fi: 'Harjoitus-WT', sv: 'Övnings-WT' },
    eventType: 'WT-harjoitus',
    official: false,
  }

  it.each([
    ['basic-info-section-official-format', false],
    ['basic-info-section-official-format-locked', true],
  ])('shows the choice: %s', async (shot, officialFormatLocked) => {
    const screen = await render(
      <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <Frame>
          <BasicInfoSection
            event={event}
            eventTypeClasses={EVENT_TYPE_CLASSES}
            eventTypes={['WT-harjoitus']}
            officialFormatLocked={officialFormatLocked}
            open
            selectedEventType={selectedEventType}
          />
        </Frame>
      </TestProvider>
    )

    const choice = screen.getByRole('combobox', { name: 'Noudattelee virallista koetta' })
    const lockedText = screen.getByText('Kokeeseen on jo tallennettu tuloksia', { exact: false })
    await expect.element(choice).toHaveValue('NOWT')
    if (officialFormatLocked) {
      await expect.element(choice).toBeDisabled()
      await expect.element(lockedText).toBeVisible()
    } else {
      await expect.element(lockedText).not.toBeInTheDocument()
    }

    await expect(screen.getByTestId('visual-root')).toMatchScreenshot(shot)
  })
})

// KOE-674: an unofficial trial's own classes, in the secretary's order, chosen by day among the classes.
// The second class has no Finnish name or day yet, so its row says what the save would refuse.
describe("an unofficial trial's own classes (KOE-674)", () => {
  const event = {
    classes: [
      { class: 'YKS', date: '2026-06-01' as const },
      { class: 'YKS', date: '2026-06-02' as const },
    ],
    description: '',
    endDate: '2026-06-02' as const,
    eventType: 'Hankinome',
    id: 'test',
    judges: [],
    name: 'Hankinome',
    ownClasses: [
      { code: 'YKS', name: { en: 'Individual', fi: 'Yksilö' } },
      { code: 'VET', name: { en: 'Veterans' } },
    ],
    startDate: '2026-06-01' as const,
  }
  const selectedEventType = {
    active: true,
    description: { en: 'Hankinome', fi: 'Hankinome', sv: 'Hankinome' },
    eventType: 'Hankinome',
    official: false,
  }
  const renderOwnClasses = () =>
    render(
      <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <Frame>
          <BasicInfoSection
            event={event}
            eventTypeClasses={EVENT_TYPE_CLASSES}
            eventTypes={['Hankinome']}
            open
            selectedEventType={selectedEventType}
          />
        </Frame>
      </TestProvider>
    )

  it('lists them with what to correct', async () => {
    const screen = await renderOwnClasses()

    await expect.element(screen.getByText('Valitse luokalle päivä kohdasta Luokat.')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-own-classes')
  })

  // Entries hold the official classes: the first own class would take them away, so none is offered.
  const renderEntered = () =>
    render(
      <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <Frame>
          <BasicInfoSection
            event={{
              ...event,
              classes: [{ class: 'ALO' as const, date: '2026-06-01' as const, entries: 3 }],
              ownClasses: undefined,
            }}
            eventTypeClasses={EVENT_TYPE_CLASSES}
            eventTypes={['Hankinome']}
            open
            selectedEventType={selectedEventType}
          />
        </Frame>
      </TestProvider>
    )

  it('offers none while the official classes have entries', async () => {
    const screen = await renderEntered()

    await expect.element(screen.getByRole('button', { name: 'Lisää oma luokka' })).toBeDisabled()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-own-classes-entered')
  })

  describeInLanguage('en', () => {
    it('offers none while the official classes have entries', async () => {
      const screen = await renderEntered()

      await expect.element(screen.getByRole('button', { name: 'Add an own class' })).toBeDisabled()
      await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-own-classes-entered-en')
    })

    it('lists them with what to correct', async () => {
      const screen = await renderOwnClasses()

      await expect.element(screen.getByText('Choose a day for the class under Classes.')).toBeVisible()
      await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-own-classes-en')
    })
  })
})

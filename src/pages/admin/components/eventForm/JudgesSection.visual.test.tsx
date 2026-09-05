import type { EventType, Judge } from '../../../../types'
import type { FieldRequirements, JudgesEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import { TIME_ZONE } from '../../../../i18n/dates'
import JudgesSection from './JudgesSection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1000 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const day = new TZDate('2026-06-01', TIME_ZONE)

const judge = (id: number, name: string, eventTypes: string[], mockTrial?: boolean): Judge => ({
  active: true,
  district: 'Uusimaa',
  email: '',
  eventTypes,
  id,
  languages: [],
  location: 'Helsinki',
  mockTrial,
  name,
  phone: '',
})

const judges = [
  judge(1, 'Aino A-tuomari', ['NOME-A']),
  judge(2, 'Nea Nowt-tuomari', ['NOWT']),
  judge(3, 'Maija Mock-tuomari', ['NOWT'], true),
]

const nowt: EventType = {
  createdAt: day,
  createdBy: 'test',
  description: { en: 'Working test', fi: 'Working test', sv: 'Working test' },
  eventType: 'NOWT',
  modifiedAt: day,
  modifiedBy: 'test',
  official: true,
}

const fields: FieldRequirements = { required: { judges: true }, state: { judges: 'confirmed' } }

it('tells a Mock trial short of judges who may judge it on their own (KOE-1357)', async () => {
  // Only the A-trial judge may judge the Mock trial independently: the rules ask for two.
  const event: JudgesEvent = {
    classes: [],
    endDate: day,
    eventType: 'NOWT',
    judges: [
      { id: 1, name: 'Aino A-tuomari', official: true },
      { id: 2, name: 'Nea Nowt-tuomari', official: true },
    ],
    mockTrial: true,
    startDate: day,
  }

  const screen = await render(
    <Frame>
      <JudgesSection event={event} fields={fields} judges={judges} open selectedEventType={nowt} />
    </Frame>
  )

  await expect.element(screen.getByText(/Mock trial: vähintään 2 tuomaria/)).toBeVisible()
  await expect
    .element(screen.getByRole('combobox', { name: 'Ylituomari' }))
    .toHaveValue('Aino A-tuomari (Mock trial -tuomari)')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('judges-section-mock-trial-short')
})

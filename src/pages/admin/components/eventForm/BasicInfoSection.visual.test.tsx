import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import { TIME_ZONE } from '../../../../i18n/dates'
import { TestProvider } from '../../../../test-utils/AtomProvider'
import { idTokenAtom } from '../../../state'
import BasicInfoSection from './BasicInfoSection'

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
  const event = {
    classes: [],
    description: '',
    endDate: new TZDate('2026-06-02', TIME_ZONE),
    id: 'test',
    judges: [],
    name: 'Kevätkoe',
    names: { en: 'Spring trial' },
    startDate: new TZDate('2026-06-01', TIME_ZONE),
  }

  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <BasicInfoSection event={event} open />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByLabelText('Nimi (Suomeksi)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('basic-info-section-names')
})

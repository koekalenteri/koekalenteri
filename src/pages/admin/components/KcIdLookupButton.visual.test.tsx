import Stack from '@mui/material/Stack'
import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '../../../__mockData__/resultsEvent'
import theme from '../../../assets/Theme'
import { KcIdLookupButton } from './KcIdLookupButton'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 500 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

/** The strip the results entry shows when the koetunnus is missing: the fact, and the way out of it. */
const MissingKcId = () => {
  const { t } = useTranslation()

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {t('event.kcIdEmpty')}
      </Typography>
      <KcIdLookupButton event={{ ...eventWithStations, kcId: undefined }} onChange={async () => {}} variant="text" />
    </Stack>
  )
}

it('offers the Kennelliitto lookup right where the missing koetunnus is noticed', async () => {
  const screen = await render(
    <Frame>
      <MissingKcId />
    </Frame>
  )

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('kc-id-lookup')
})

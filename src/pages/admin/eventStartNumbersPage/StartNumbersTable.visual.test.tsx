import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { StartNumbersTable } from './StartNumbersTable'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 760 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// One frozen number, one fresh entry, and a duplicate pair flagged as it is typed (KOE-1218).
const rows = [
  {
    dog: { name: 'Ensimmainen', regNo: 'REG-run-1' },
    groupNumber: 1,
    handler: { name: 'Minsu Rauramo' },
    id: 'run-1',
    startNumber: 3,
  },
  { dog: { name: 'Toinen', regNo: 'REG-run-2' }, groupNumber: 2, handler: { name: 'Sari Alho' }, id: 'run-2' },
  { dog: { name: 'Kolmas', regNo: 'REG-run-3' }, groupNumber: 3, handler: { name: 'Inka Heller' }, id: 'run-3' },
]

it('receives the venue draw as values, flagging duplicates as they are typed', async () => {
  const screen = await render(
    <Frame>
      <StartNumbersTable drafts={{ 'run-2': '5', 'run-3': '5' }} onChange={() => {}} rows={rows} />
    </Frame>
  )

  await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry')
})

import type { RulesDocument } from '../../generated/docs'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import '../../index.css'
import { RulesBody } from './RulesBody'

const VIEWPORT = { height: 1100, width: 900 }

// A slice of the real document's shape: the whole text would be a 60-page picture.
const document: RulesDocument = {
  amended: '2025-05-07',
  approved: '2022-11-26',
  edition: '2023-04-15',
  parts: [
    {
      chapters: [
        {
          id: 'c-1-1',
          sections: [
            {
              html: '<p>Noudatetaan kulloinkin voimassa olevaa Kennelliiton yleistä jääviyssääntöä.</p>',
              id: 's-1-4',
              level: 1,
              number: '1.4',
              text: 'noudatetaan kulloinkin voimassa olevaa kennelliiton yleistä jääviyssääntöä.',
              title: 'JÄÄVIYS',
            },
          ],
          title: 'YLEISET MÄÄRÄYKSET',
        },
        {
          id: 'c-1-2',
          sections: [
            {
              html: '<p>Koirat palkitaan luokittain.</p><ul><li>1. palkinto</li><li>2. palkinto</li></ul>',
              id: 's-4-4',
              level: 1,
              number: '4.4',
              text: 'koirat palkitaan luokittain. 1. palkinto 2. palkinto',
              title: 'PALKITSEMINEN',
            },
            {
              html: '<p>Kokeen tuomari päättää.</p>',
              id: 's-4-4-1',
              level: 2,
              number: '4.4.1',
              text: 'kokeen tuomari päättää.',
              title: 'Yleistä',
            },
          ],
          title: 'NOUTAJIEN B-METSÄSTYSKOKEEN SÄÄNNÖT (NOME-B)',
        },
      ],
      intro: '<p>Hyväksytty Kennelliiton valtuustossa 26.11.2022.</p>',
      number: 'OSA 1',
      title: 'NOUTAJIEN RODUNOMAISTEN KOKEIDEN SÄÄNNÖT',
    },
  ],
  path: 'saannot/noutajien-kokeet',
  source: 'https://www.kennelliitto.fi/lomakkeet/noutajien-rodunomaisten-kokeiden-saannot',
  title: 'Noutajien rodunomaisten kokeiden säännöt ja ohjeet',
}

it('shows the notice, the search, the contents and the sections', async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
      <ThemeProvider theme={theme}>
        <RulesBody document={document} />
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 4, name: /PALKITSEMINEN/ })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('rules-body')
})

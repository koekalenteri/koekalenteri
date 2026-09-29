import type { EventCopyResult } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { APIError } from '@/api/http'
import theme from '@/assets/Theme'
import CopyToEnvironmentDialog from './CopyToEnvironmentDialog'

const renderDialog = (onCopy: (target: string) => Promise<EventCopyResult | undefined>) =>
  render(
    <ThemeProvider theme={theme}>
      <CopyToEnvironmentDialog
        eventName="NOME-B Kangasala 12.10.2026"
        onClose={() => undefined}
        onCopy={onCopy}
        open
        targets={['test', 'dev']}
      />
    </ThemeProvider>
  )

// The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
it('offers test and dev from prod, and says what the copy does to people and payments (KOE-1471)', async () => {
  const screen = await renderDialog(async () => undefined)

  await expect.element(screen.getByText('Testiympäristö')).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('copy-to-environment-choose')
})

it('names the judges the target cannot use as they are', async () => {
  const screen = await renderDialog(async (target) => ({
    eventId: 'copy-1',
    judges: [
      { name: 'Tuomo Tuomari', reason: 'missing' },
      { name: 'Irma Ylituomari', reason: 'inactive' },
    ],
    target,
  }))

  await screen.getByRole('button', { name: 'Kopioi' }).click()

  await expect.element(screen.getByText('Koe kopioitiin testiympäristöön.', { exact: false })).toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('copy-to-environment-done')
})

it("shows the target's refusal in its own words", async () => {
  const screen = await renderDialog(async () => {
    throw new APIError(new Response(null, { status: 502 }), {
      message: 'The target refused the copy: The copier is not an admin in the target environment',
    })
  })

  await screen.getByRole('button', { name: 'Kopioi' }).click()

  await expect
    .element(screen.getByText('The copier is not an admin in the target environment', { exact: false }))
    .toBeVisible()
  await expect(screen.getByRole('dialog')).toMatchScreenshot('copy-to-environment-failed')
})

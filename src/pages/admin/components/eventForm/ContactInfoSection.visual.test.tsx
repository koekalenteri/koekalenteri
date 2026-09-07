import type { User } from '../../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import ContactInfoSection from './ContactInfoSection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const official: User = {
  email: 'official@example.com',
  id: '0',
  location: "official's place",
  name: 'Test Official',
  officer: ['Type-A'],
  phone: '+3584012345',
}

const secretary: User = {
  email: 'secretary@example.com',
  id: '0',
  location: "secretary's place",
  name: 'Test Secretary',
  phone: '+3584054321',
}

// The "everything shared" variant already has a screenshot: EventForm.visual.test.tsx's own
// desktop capture shows this section with every field checked. These two cover what that one
// doesn't: nothing shared, and a mix.

it('shows every field unchecked when nothing is shared', async () => {
  const screen = await render(
    <Frame>
      <ContactInfoSection contactInfo={{}} official={official} secretary={secretary} onChange={() => {}} open />
    </Frame>
  )

  await expect.element(screen.getByText('Vastaava koetoimitsija')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('contact-info-section-none-shared')
})

it('shows a mix of shared and hidden fields', async () => {
  const screen = await render(
    <Frame>
      <ContactInfoSection
        contactInfo={{
          official: { email: '', name: 'Test Official', phone: '+3584012345' },
          secretary: { email: 'secretary@example.com', name: '', phone: '' },
        }}
        official={official}
        secretary={secretary}
        onChange={() => {}}
        open
      />
    </Frame>
  )

  await expect.element(screen.getByText('Koesihteeri')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('contact-info-section-mixed')
})

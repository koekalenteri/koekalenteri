import { render } from 'vitest-browser-react'
import LoadingIndicator from './LoadingIndicator'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', width: 400 }}>
    {children}
  </div>
)

it('centers the spinner in the space it is given', async () => {
  const screen = await render(
    <Frame>
      <LoadingIndicator />
    </Frame>
  )

  await expect.element(screen.getByRole('progressbar', { name: 'loading' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('loading-indicator')
})

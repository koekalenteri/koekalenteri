import { render } from 'vitest-browser-react'
import Banner from './Banner'

/** Wrapper the screenshot is taken of: a fixed width keeps the capture stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ width: 1200 }}>
    {children}
  </div>
)

it('fills the header width with the banner image', async () => {
  const screen = await render(
    <Frame>
      <Banner />
    </Frame>
  )

  const image = screen.getByAltText('banner')
  await expect.element(image).toBeVisible()

  // The image fades in over 300ms once loaded; the screenshot must wait out that transition
  // rather than catch a half-opaque frame.
  await new Promise((resolve) => setTimeout(resolve, 400))

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('banner')
})

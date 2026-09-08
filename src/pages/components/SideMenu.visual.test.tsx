import { ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import { SideMenu } from './SideMenu'

// The admin section is the part of the menu with the longest labels, so it is the part that shows
// first when the collapsed drawer stops hiding them.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anna Admin' }),
}))

// The menu has three widths, and the viewport alone decides which one SideMenu asks the drawer for:
// below `md` it is a temporary drawer that takes no room until the header opens it, between `md` and
// `lg` a permanent one collapsed to its icons, and from `lg` up a permanent one already open.
const PHONE = { height: 800, width: 390 }
const COLLAPSED = { height: 640, width: 1000 }
const EXPANDED = { height: 640, width: 1300 }

/**
 * A Drawer's paper is `position: fixed` (and the temporary variant's is in a portal besides), so a
 * wrapper around SideMenu has no size of its own and would capture nothing. The paper is the thing
 * to photograph; name it so the matcher can find it.
 */
const renderAt = async ({ height, width }: { height: number; width: number }, open?: boolean) => {
  await page.viewport(width, height)

  await render(
    <ThemeProvider theme={theme}>
      <TestProvider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
        <MemoryRouter>
          <SnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <SideMenu open={open} onClose={vi.fn()} />
            </Suspense>
          </SnackbarProvider>
        </MemoryRouter>
      </TestProvider>
    </ThemeProvider>
  )

  // The temporary drawer slides in from off-screen, and a baseline captured mid-slide is not a
  // layout anyone gets. Wait for the paper to be where it comes to rest -- flush with the left edge.
  const paper = await vi.waitUntil(() => {
    const candidate = document.querySelector('.MuiDrawer-paper')
    return candidate?.getBoundingClientRect().left === 0 ? candidate : false
  })
  paper.setAttribute('data-testid', 'visual-root')

  return page.getByTestId('visual-root')
}

it('shows icons only while the drawer is collapsed', async () => {
  const drawer = await renderAt(COLLAPSED)

  // The labels stay in the DOM for the tooltips and the screen reader, but nothing of them may be
  // drawn. Neither obvious probe says that: a label the drawer clips still reports as visible, and
  // its own box is already 0 px wide while the text spills out of it. Measure what is painted --
  // the text's range -- which is what showed the first few pixels of every word in KOE-1403.
  const drawn = Array.from(document.querySelectorAll('.MuiListItemText-primary')).map((label) => {
    const range = document.createRange()
    range.selectNodeContents(label)
    return Math.round(range.getBoundingClientRect().width)
  })
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn).toEqual(drawn.map(() => 0))
  await expect(drawer).toMatchScreenshot('side-menu-collapsed')
})

it('shows the labels once the drawer is open', async () => {
  const drawer = await renderAt(EXPANDED)

  await expect.element(page.getByText('Tapahtumat', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Viestipohjat')).toBeVisible()
  await expect(drawer).toMatchScreenshot('side-menu-expanded')
})

it('opens over the page at full width on a phone', async () => {
  const drawer = await renderAt(PHONE, true)

  // Never the collapsed look on a phone: the drawer that opens there is the wide one, over the page.
  await expect.element(page.getByText('Tapahtumat', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Viestipohjat')).toBeVisible()
  await expect(drawer).toMatchScreenshot('side-menu-phone-open')
})

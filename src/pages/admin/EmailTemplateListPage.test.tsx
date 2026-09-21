import type { MockedFunction } from 'vitest'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { putEmailTemplate } from '../../api/email'
import { APIError } from '../../api/http'
import theme from '../../assets/Theme'
import { shimCodeMirrorLayout } from '../../test-utils/codemirror'
import { flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EmailTemplateListPage from './EmailTemplateListPage'

vi.mock('../../api/email')
vi.mock('../../api/user')

const mockPutEmailTemplate = putEmailTemplate as MockedFunction<typeof putEmailTemplate>

describe('EmailTemplateListPage', () => {
  beforeAll(() => {
    shimCodeMirrorLayout()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    // The edit in progress lives in session storage, and would otherwise carry over to the next test.
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  const setup = async () => {
    const { user } = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <EmailTemplateListPage />
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    await user.click(screen.getByText('emailTemplate.registration'))
    await flushPromises()

    // The Finnish editor is the visible one; the English one is mounted hidden beside it.
    const [editor] = screen.getAllByRole('textbox')
    return { editor, user }
  }

  it('refuses to save a template that does not parse, and says where it stopped', async () => {
    const { editor, user } = await setup()

    // A closing tag typed at the top of the Finnish template, with nothing to close.
    await user.type(editor, '{{{{/if}}')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(screen.getByRole('alert')).toHaveTextContent('templateEditor.errorOnLine')
    expect(mockPutEmailTemplate).not.toHaveBeenCalled()
  })

  it("shows the server's reason and opens the language it names", async () => {
    const { editor, user } = await setup()
    mockPutEmailTemplate.mockRejectedValueOnce(
      new APIError(new Response(null, { status: 400 }), {
        language: 'en',
        message: '#if requires exactly one argument',
      })
    )

    await user.type(editor, 'x')
    await flushPromises()
    expect(screen.getByRole('tab', { name: 'locale.fi' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(mockPutEmailTemplate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('templateEditor.rejected')
    expect(screen.getByRole('tab', { name: 'locale.en' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clears the notice when the template is edited again', async () => {
    const { editor, user } = await setup()

    await user.type(editor, '{{{{/if}}')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(editor, 'x')
    await flushPromises()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

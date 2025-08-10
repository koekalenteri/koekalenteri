import type { EmailTemplate } from '../../../types'
import type { templateSchema } from './TemplateEditor.schema'

import { screen } from '@testing-library/react'

import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import { TemplateEditor } from './TemplateEditor'

describe('TemplateEditor', () => {
  beforeAll(() => {
    function getBoundingClientRect(): DOMRect {
      const rec = {
        x: 0,
        y: 0,
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
      }
      return { ...rec, toJSON: () => rec }
    }

    class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
      item(index: number): DOMRect | null {
        return this[index]
      }
    }

    document.elementFromPoint = (): null => null
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect
    HTMLElement.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList()
    Range.prototype.getBoundingClientRect = getBoundingClientRect
    Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList()

    jest.useFakeTimers()
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  const baseTemplate: EmailTemplate = {
    fi: '',
    en: '',
  } as unknown as EmailTemplate

  function setup(opts?: {
    value?: string
    lang?: 'fi' | 'en'
    onChange?: (t: EmailTemplate) => void
    templateId?: keyof typeof templateSchema
    hidden?: boolean
  }) {
    const onChange = opts?.onChange ?? jest.fn()
    const language = (opts?.lang ?? 'fi') as any
    const template = { ...baseTemplate, [language]: opts?.value ?? '' } as EmailTemplate

    const { user } = renderWithUserEvents(
      <div style={{ height: 400, width: 600 }}>
        <TemplateEditor
          templateId={opts?.templateId as any}
          template={template}
          language={language}
          onChange={onChange}
          hidden={opts?.hidden}
        />
      </div>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    // CodeMirror mounts a contentEditable element with role textbox
    const editor = screen.queryByRole('textbox')
    return { editor, onChange, user }
  }

  it('renders editor with initial value', async () => {
    const initial = 'Hello {{event.name}}'
    const { editor } = setup({ value: initial })

    expect(editor).toBeInTheDocument()
    expect(editor).toHaveTextContent(initial)
  })

  it('respects hidden prop by not displaying the Paper', () => {
    const { editor } = setup({ hidden: true })

    if (editor) {
      expect(editor).not.toBeVisible()
    }
  })

  it('calls onChange', async () => {
    const onChange = jest.fn()
    const { editor, user } = setup({ value: '', onChange })

    expect(editor).toBeInTheDocument()
    await user.type(editor!, 'Hello World!')
    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith({ fi: 'Hello World!', en: '' })
    expect(onChange).toHaveBeenCalledTimes(12)
  })

  describe('lint integration', () => {
    it('shows a warning diagnostic for unknown property in mustache', async () => {
      const { editor } = setup({ value: 'Hello {{event.unknownKey}}', templateId: 'receipt' })

      editor?.focus()
      await flushPromises()

      expect(editor?.querySelector('.cm-lintRange-warning')).toHaveTextContent('unknownKey')
    })

    it('does not warn for known path based on schema', async () => {
      const { editor } = setup({ value: 'Hello {{event.name}}', templateId: 'receipt' })
      editor?.focus()
      await flushPromises()

      expect(editor?.querySelector('.cm-lintRange-warning')).toBeNull()
    })
  })

  describe('autocomplete integration', () => {
    it('offers top-level keys when typing inside {{ }}', async () => {
      const { editor, user } = setup({ value: '', templateId: 'receipt' })
      await user.type(editor!, '{{{{e')
      await flushPromises()
      expect(editor).toHaveTextContent('{{e}}')

      const option = screen.getByRole('option', { name: 'e vent …' })
      expect(option).toBeInTheDocument()
    })

    it('offers child keys after selecting a property with trailing dot', async () => {
      const { editor, user } = setup({ value: '', templateId: 'receipt' })
      await user.type(editor!, '{{{{event.')
      await flushPromises()
      expect(editor).toHaveTextContent('{{event.}}')

      const option = screen.getByRole('option', { name: 'name string' })
      expect(option).toBeInTheDocument()
    })

    it('completion apply inserts and reopens for object to chain children', async () => {
      const { editor, user } = setup({ value: '', templateId: 'receipt' })
      editor!.focus()
      await user.type(editor!, '{{{{e')
      await flushPromises()
      expect(editor).toHaveTextContent('{{e}}')

      // pick "event" (object) then expect re-open with children, then pick "name"
      const eventOption = screen.getByRole('option', { name: 'e vent …' })
      await user.click(eventOption)
      await flushPromises()

      const nameOption = screen.getByRole('option', { name: 'name string' })
      expect(nameOption).toBeInTheDocument()
      await user.click(nameOption)
      await flushPromises()

      // The content should now include {{event.name}}
      expect(editor).toHaveTextContent(/{{\s*event\.name\s*}}/)
    })
  })

  it('uses defaultSchema when templateId not provided', async () => {
    const { editor, user } = setup({ value: 'Hi {{reg.owner.', templateId: undefined })
    editor!.focus()
    await user.type(editor!, '{{{{reg.owner.')
    await flushPromises()

    const nameOption = screen.getByRole('option', { name: 'name string' })
    expect(nameOption).toBeInTheDocument()
  })
})

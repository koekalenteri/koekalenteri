import type { NodeResult, Result } from 'axe-core'
import { readableTextOnly } from './a11yExemptions'

/** A disabled field as MUI renders one: the class is on the group, not on the text inside it. */
const disabledField = () => {
  const field = document.createElement('div')
  field.className = 'MuiFormControl-root Mui-disabled'
  field.innerHTML = '<label>Rekisterinumero</label><p class="MuiFormHelperText-root">Haettu Kennelliitosta</p>'
  document.body.append(field)
  return field.querySelector('p') as HTMLElement
}

const plainText = () => {
  const text = document.createElement('p')
  text.textContent = 'Numero on jo varattu'
  document.body.append(text)
  return text
}

const violation = (id: string, ...elements: HTMLElement[]): Result =>
  ({ id, nodes: elements.map((element) => ({ element })) as NodeResult[] }) as Result

const ids = (violations: Result[]) => violations.map((item) => [item.id, item.nodes.length])

describe('readableTextOnly', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  /**
   * The exemption itself: WCAG 1.4.3 does not ask a ratio of text that is part of an inactive
   * component, and a disabled field's helper text is that (KOE-1375).
   */
  it('drops a contrast finding on a disabled field, and the violation with it', () => {
    expect(readableTextOnly([violation('color-contrast', disabledField())])).toEqual([])
  })

  it('keeps a contrast finding on text a reader is meant to read', () => {
    expect(ids(readableTextOnly([violation('color-contrast', plainText())]))).toEqual([['color-contrast', 1]])
  })

  it('keeps the readable nodes of a violation that has both', () => {
    const [kept] = readableTextOnly([violation('color-contrast', disabledField(), plainText())])

    expect(kept.nodes).toHaveLength(1)
    expect(kept.nodes[0].element?.textContent).toBe('Numero on jo varattu')
  })

  /**
   * The filter is this narrow on purpose. Being disabled excuses the contrast of a control's text
   * and nothing else: a missing label or a nested interactive is as real there as anywhere.
   */
  it('leaves every other rule alone, disabled or not', () => {
    const violations = [violation('label', disabledField()), violation('nested-interactive', disabledField())]

    expect(ids(readableTextOnly(violations))).toEqual([
      ['label', 1],
      ['nested-interactive', 1],
    ])
  })

  it('reports nothing when there was nothing to report', () => {
    expect(readableTextOnly([])).toEqual([])
  })
})

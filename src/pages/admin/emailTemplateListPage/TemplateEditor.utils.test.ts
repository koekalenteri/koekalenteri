import { resolveForCompletion } from './TemplateEditor.utils'

describe('TemplateEditor.utils', () => {
  it('does not fabricate object scope when #each target is missing', () => {
    const schema = {
      event: {
        name: 'x',
      },
    }
    const doc = '{{#each missing.path as |item|}}{{item.}}{{/each}}'
    const pos = doc.indexOf('item.') + 'item.'.length

    const result = resolveForCompletion(doc, pos, schema, 'item.')

    expect(result.parent).toBeUndefined()
  })
})

import { explainTemplateRejection, findEmailTemplateError, findTemplateSyntaxError } from './emailTemplate'

describe('emailTemplate', () => {
  describe('findTemplateSyntaxError', () => {
    it.each([
      ['plain text', 'Hei!'],
      ['a mustache', 'Hei {{reg.dog.name}}'],
      ['nested blocks', '{{#each qualifyingResults}}{{#if this.type}}{{this.type}}{{/if}}{{/each}}'],
      ['a partial', '{{> footer}}'],
      ['an empty source', ''],
    ])('accepts %s', (_name, source) => {
      expect(findTemplateSyntaxError(source)).toBeUndefined()
    })

    it('names the block that is closed with the wrong tag, with its position', () => {
      expect(findTemplateSyntaxError('Hei\n\nx {{#if reg.dog}}\nrivi\n{{/each}}')).toEqual({
        column: 5,
        endColumn: 7,
        line: 3,
        message: "if doesn't match each",
      })
    })

    it('names the line a mustache is left open on', () => {
      expect(findTemplateSyntaxError('Hei\n{{reg.dog\nterve')).toEqual({
        line: 2,
        message: 'Unexpected character inside {{ }}',
      })
    })

    it('names the last line when a block is never closed', () => {
      expect(findTemplateSyntaxError('x\n\n{{#if reg.notes}}\nfoo')).toEqual({
        line: 4,
        message: 'The template ends before a {{ }} or a block is closed',
      })
    })

    it('names a closing tag with nothing to close', () => {
      expect(findTemplateSyntaxError('foo\n{{/if}}')).toEqual({
        line: 2,
        message: 'A closing {{/…}} without a block to close',
      })
    })

    it('names one closing brace too many', () => {
      expect(findTemplateSyntaxError('{{foo }}}')).toEqual({ line: 1, message: 'Too many closing braces' })
    })

    it('keeps the parser line for a token it has no words for', () => {
      expect(findTemplateSyntaxError('{{#if}}\n{{else}}\n{{else}}\n{{/if}}')).toEqual({
        line: 3,
        message: "Expecting 'OPEN_ENDBLOCK', got 'INVERSE'",
      })
    })
  })

  describe('findEmailTemplateError', () => {
    it('is nothing when both languages parse', () => {
      expect(findEmailTemplateError({ en: '{{title}}', fi: '{{title}}' })).toBeUndefined()
    })

    it('names the Finnish template first', () => {
      expect(findEmailTemplateError({ en: '{{/if}}', fi: 'a\n{{/if}}' })).toEqual({
        language: 'fi',
        line: 2,
        message: 'A closing {{/…}} without a block to close',
      })
    })

    it('names the English template when Finnish parses', () => {
      expect(findEmailTemplateError({ en: '{{/if}}', fi: 'ok' })).toEqual({
        language: 'en',
        line: 1,
        message: 'A closing {{/…}} without a block to close',
      })
    })
  })

  describe('explainTemplateRejection', () => {
    it('is nothing when every part renders', () => {
      expect(
        explainTemplateRejection({
          HtmlPart: '<p>{{#if reg.notes}}{{reg.notes}}{{/if}}</p>',
          SubjectPart: '{{subject}}',
          TemplateName: 'x',
          TextPart: '{{#each qualifyingResults}}{{this.type}}{{/each}}',
        })
      ).toBeUndefined()
    })

    it('says what the compiler says of a block helper without its argument', () => {
      expect(explainTemplateRejection({ HtmlPart: '{{#if}}x{{/if}}', TemplateName: 'x' })).toBe(
        '#if requires exactly one argument'
      )
    })

    it('names a helper that does not exist', () => {
      expect(explainTemplateRejection({ SubjectPart: '{{foo bar}}', TemplateName: 'x' })).toBe('Missing helper: "foo"')
    })
  })
})

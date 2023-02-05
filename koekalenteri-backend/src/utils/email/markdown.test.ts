import { markdownToHtml, markdownToTemplate, markdownToText } from './markdown'

const testTemplate = '[subject]: # ({{subject}}: {{reg.eventType}} {{eventDate}} {{event.location}})\n\n# {{title}}\n\n{{#unless reg.cancelled ~}}\n[Edit registration]({{link}}/edit)\n[Cancel registration]({{link}}/cancel)\n{{/unless}}\n\ntable header | is removed\n:-- | ----\nEvent          :| {{reg.eventType}} {{eventDate}} {{event.location}} {{#if event.name}}({{event.name}}){{/if}}\nClass          :| {{reg.class}}\nDog            :| {{reg.dog.regNo}} {{reg.dog.name}}\nIdentification :| {{reg.dog.rfid}}\nBreed          :| {{dogBreed}}\nOwne           :| {{reg.owner.name}}\nHometown       :| {{reg.owner.location}}\nEmail          :| {{reg.owner.email}}\nHandler        :| {{reg.handler.name}}\nHometown       :| {{reg.handler.location}}\nEmail          :| {{reg.handler.email}}\nPhone          :| {{reg.handler.phone}}\nTimes          :| {{regDates}}\nReserve        :| {{reserveText}}\n\n**Qualifying results**\n{{#each qualifyingResults}}\n{{this.type}} {{this.result}}, {{this.date}}, {{this.location}}, {{this.judge}}\n{{/each}}\n{{#if reg.notes}}\n\n**Notes**\n{{reg.notes}}\n{{/if}}\n\nYou can view your registration details here: [View registration details]({{link}})\n\nBest regards,\n{{#if event.contactInfo.secretary.name ~}}\n{{event.secretary.name}}\nSecretary\n{{/if ~}}\n{{#if event.contactInfo.secretary.email ~}}\n{{event.secretary.email}}\n{{/if ~}}\n{{#if event.contactInfo.secretary.phone ~}}\np. {{event.secretary.phone}}\n{{/if ~}}\n\n{{#if event.contactInfo.official.name ~}}\n{{event.official.name}}\nChief officer\n{{/if ~}}\n{{#if event.contactInfo.official.email ~}}\n{{event.official.email}}\n{{/if ~}}\n{{#if event.contactInfo.official.phone ~}}\np. {{event.official.phone}}\n{{/if ~}}'

describe('markdown', () => {
  describe('markdownToText', () => {
    it('should return empty string for empty imput', async () => {
      expect(await markdownToText('')).toEqual({subject: '', text: ''})
    })

    it('should convert a template', async () => {
      expect(await markdownToText(testTemplate)).toMatchSnapshot(``)
    })
  })

  describe('markdownToHtml', () => {
    it('should return empty string for empty imput', async () => {
      expect(await markdownToHtml('')).toEqual('')
    })

    it('should convert a template', async () => {
      expect(await markdownToHtml(testTemplate)).toMatchSnapshot(``)
    })
  })

  describe('markdownToTemplate', () => {
    it('should return the template name', async () => {
      expect(await markdownToTemplate('testTemplateName', '')).toEqual({
        TemplateName: 'testTemplateName',
        SubjectPart: '',
        TextPart: '',
        HtmlPart: '',
      })
    })

    it('should return render detect [subject]', async () => {
      expect(await markdownToTemplate('testTemplateName', '[subject]: # (test)\n# content')).toEqual({
        TemplateName: 'testTemplateName',
        SubjectPart: 'test',
        TextPart: 'content\n',
        HtmlPart: '<h1>content</h1>\n',
      })
    })
  })
})

# Email template defaults

The default content of the email templates, which every deploy puts in place where an environment
does not have the template yet ([KOE-1363](https://koekalenteri.atlassian.net/browse/KOE-1363)). A
template added to the code is then usable as soon as the version is deployed, with no one writing
it by hand on the Viestipohjat page of each environment.

## Adding a template

1. Add the id to `EmailTemplateId` (`src/types/Email.ts`) and to `EMAIL_TEMPLATE_IDS`
   (`src/lib/emailTemplateIds.ts`, which the compiler keeps complete).
2. Write its content in two files here, one per language: `<id>.fi.ts` and `<id>.en.ts`, each
   exporting the markdown as a template literal:

   ```ts
   export default `[subject]: # (Viestin otsikko {{reg.eventType}})

   # Otsikko

   Teksti, jossa {{reg.handler.name}} ja {{#if event.name}}{{event.name}}{{/if}}.
   `
   ```

   A backtick in the content is written `` \` `` and a `${` is written `\${`; everything else,
   Handlebars' `{{ }}` included, is written as it is.
3. Import both into `EMAIL_TEMPLATE_DEFAULTS` in `defaults.ts`.

`defaults.test.ts` fails on a template id that is not legacy and lacks a Finnish or an English
default, on a default the templates page would refuse to save, and on a legacy id that has a
default but is still on the list. The legacy list names the twelve templates that predate the
defaults; an id leaves it when it gets its defaults, and none joins it.

## What the deploy does

`SeedEmailTemplatesFunction` runs right after `sam deploy`, in the `Seed email templates` step of
`release.yml`, and calls `seedEmailTemplates` in `../emailTemplate.ts`:

- It reads the table once. A default whose id has a row is left alone, whatever the row holds: an
  organizer's edit is never replaced, and changing a default later reaches no environment that
  already has the template.
- For each default whose id has no row, one at a time: both sources are checked as the templates
  page checks them, the SES templates `<id>-<stack>-fi` and `<id>-<stack>-en` (the names a send
  uses) are created, and then the row is written on condition that the table still holds none
  (`writeNewEmailTemplate`). The row is stamped `createdBy` and `modifiedBy` `system`.
- SES comes before the row, as on a save: a failure there leaves no row, and the next deploy tries
  the template again. A failed template answers 500, which fails the deploy step; the others are
  still seeded.
- A written row bumps the `emailTemplates` data version and tells the admins watching, so a list a
  browser holds cached is fetched again instead of showing the empty placeholder.

## What it does not do

- It does not repair a legacy template. One of the twelve that has no row in some environment (a
  fresh stack, say) stays empty there until someone writes it on the templates page.
- It does not run on the local development tables (`npm run init-tables` seeds only
  `_test_data_`), where a template is written on the templates page as before, nor in the browser
  tests, whose sends never read the table and whose fake SES accepts any template name.

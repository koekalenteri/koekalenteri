# AWS Simple Email Service Templates

AWS uses [Handlebars](https://handlebarsjs.com/) as the templating language.

## Creating a new template

1. Create a directory, the directory name is the template name, excluding language suffix.
1. Create the markdown for each available languages in that newly created folder.
1. Run `node generate.mjs` which verifies the handlebars syntax and generates [template]-[lang].json for each language.
1. Run `aws ses create-template --cli-input-json file://[template]-[lang].json` for each language.

## Updating existing template

**NOTE:** The same templates are shared by all versions of Koekalenteri, so the changes must be backward compatible. If in doubt, create a new template instead and use that in the new version of Koekalenteri you are developing.

1. Make required changes in the [template] folder (for each language if applicapple)
1. Run `node generate.mjs`
1. Run `aws ses update-template --cli-input-json file://[template]-[lang].json` for each template and language you changed.

## Samples

If `_sample.mjs` is present in template folder, sample of all the different versions of the generated templates are created, using the default export of that file as data.
Samples are created in `samples` folder.

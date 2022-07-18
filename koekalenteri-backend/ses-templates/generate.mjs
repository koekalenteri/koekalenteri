import Handlebars from 'handlebars';
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'fs'
import {read} from 'to-vfile'
import {reporter} from 'vfile-reporter'
import {unified} from 'unified'
import {visit, SKIP} from 'unist-util-visit'
import tableHandler from './handlers/table.mjs'
import link from './handlers/link.mjs'

const templates = readdirSync('.', {withFileTypes: true})
  .filter(entry => entry.isDirectory() && !['samples', 'handlers'].includes(entry.name))
  .map(entry => entry.name);

for (const template of templates) {
  const contextFn = `./${template}/_sample.mjs`;
  const context = existsSync(contextFn) && await import(contextFn);
  if (!context) {
    console.warn(`${contextFn} does not exist, can not generate samples`);
  }

  for (const lang of ['fi', 'en']) {
    const templateObj = await genJson(template, lang);
    if (!templateObj) {
      continue;
    }
    writeFileSync(`${template}-${lang}.json`, JSON.stringify(templateObj));
    if (context) {
      if (!existsSync('samples')) {
        mkdirSync('samples');
      }
      writeFileSync(`samples/${template}-${lang}.txt`, Handlebars.compile(templateObj.Template.TextPart)(context.default));
      writeFileSync(`samples/${template}-${lang}.html`, Handlebars.compile(templateObj.Template.HtmlPart)(context.default));
    }
  }
}

async function genJson(template, lang) {
  const source = `${template}/${lang}.md`;

  if (!existsSync(source)) {
    console.warn(`${source} does not exist!`);
    return null;
  }

  let subject = '';
  const extractSubject = () =>
    (tree) =>
      visit(tree, (node, index, parent) => {
        if (subject === '' && node.type === 'definition') {
          subject = node.title;
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
      });

  const removeTableHead = () =>
    (tree) =>
      visit(tree, (node, index, parent) => {
        if (node.type === 'tableRow' && index === 0 && !parent.headSkipped) {
          parent.children.splice(index, 1);
          parent.headSkipped = true;
          return [SKIP, index];
        }
      });

  const linkAsText = () =>
    (tree) =>
      visit(tree, (node) => {
        if (node.type === 'link') {
          node.children[0].value = node.url;
        }
      });

  const text = await unified()
    .use(remarkParse)
    .use(extractSubject)
    .use(remarkGfm)
    .use(removeTableHead)
    .use(linkAsText)
    .use(remarkPlainText)
    .process(await read(source));

  console.error(reporter(text))
  Handlebars.precompile(String(text), {strict: true});

  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkHtml, {handlers: {table: tableHandler, link}})
    .process(await read(source));

  return {
    "Template": {
      "TemplateName": `${template}-${lang}`,
      "SubjectPart": subject,
      "TextPart": String(text),
      "HtmlPart": String(html)
    }
  };
}

function remarkPlainText() {
  Object.assign(this, {Compiler: compiler})

  /**
   * @type {import('unified').CompilerFunction<Root, string>}
   */
  function compiler(node, file) {
    const result = toPlainText(node);

    if (file.extname) {
      file.extname = '.txt'
    }

    // Add an eof eol.
    return node &&
      node.type &&
      node.type === 'root' &&
      result &&
      /[^\r\n]/.test(result.charAt(result.length - 1))
      ? result + '\n'
      : result
  }
}

function toPlainText(node) {
  return one(node);
}

function one(node) {
  //console.warn(node);
  return (
    (node &&
      typeof node === 'object' &&
      ((node.value && formatValue(node)) ||
        ('children' in node && all(node.type, node.children)) ||
        (Array.isArray(node) && all('array', node)))) ||
    ''
  );
}

function formatValue(node) {
  if (node.value.endsWith(':')) {
    return node.value + ' ';
  }
  return node.value;
}

function all(type, values) {
  /** @type {Array.<string>} */
  var result = []
  var index = -1

  while (++index < values.length) {
    result[index] = one(values[index])
  }

  if (type === 'tableRow' || type === 'table') {
    result.push("\n");
  }
  if (type === 'paragraph' || type === 'heading') {
    result.push("\n\n");
  }

  return result.join('')
}

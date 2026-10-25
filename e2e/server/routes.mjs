/**
 * The API routes as the deployed template declares them: every `Type: Api` event of every function
 * in `dist/template.yaml`, with its path, method, function and whether the Cognito authorizer guards
 * it. Reading the same template the stack is deployed from keeps the local API from drifting.
 */
import fs from 'node:fs/promises'
import { parse } from 'yaml'

/** The CloudFormation intrinsic tags; the routes never need their values. */
const tags = [
  ...['!Ref', '!Sub', '!GetAtt', '!ImportValue'].map((tag) => ({ identify: () => false, resolve: () => tag, tag })),
  ...['!Ref', '!Join', '!Sub', '!GetAtt', '!Select', '!Split', '!If', '!Equals', '!Not', '!And', '!Or'].map((tag) => ({
    collection: 'seq',
    identify: () => false,
    resolve: () => tag,
    tag,
  })),
  ...['!Sub', '!If'].map((tag) => ({ collection: 'map', identify: () => false, resolve: () => tag, tag })),
]

const escapeRegExp = (text) => text.replaceAll(/[.*+?^$()|[\]\\]/g, '\\$&')

/** `/event/{eventId}` → a pattern that captures `eventId`; `{proxy+}` captures the rest of the path. */
const pathPattern = (path) => {
  const names = []
  const source = path
    .split(/(\{[^}]+\})/)
    .map((part) => {
      const param = /^\{([^}+]+)(\+?)\}$/.exec(part)
      if (!param) return escapeRegExp(part)
      names.push(param[1])
      return param[2] ? '(.+)' : '([^/]+)'
    })
    .join('')
  return { names, regexp: new RegExp(`^${source}$`) }
}

/**
 * @returns {Promise<Array<{ authorized: boolean, functionName: string, method: string, names: string[],
 *   path: string, regexp: RegExp }>>}
 */
export const readRoutes = async (templatePath) => {
  const template = parse(await fs.readFile(templatePath, 'utf8'), { customTags: tags })
  const routes = []
  for (const [functionName, resource] of Object.entries(template.Resources ?? {})) {
    if (resource?.Type !== 'AWS::Serverless::Function') continue
    for (const event of Object.values(resource.Properties?.Events ?? {})) {
      if (event?.Type !== 'Api') continue
      const { Auth, Method, Path } = event.Properties
      routes.push({
        authorized: Auth?.Authorizer === 'CognitoAuthorizer',
        functionName,
        method: Method.toUpperCase(),
        path: Path,
        ...pathPattern(Path),
      })
    }
  }
  // A literal segment beats a parameter, as in API Gateway: `/event/copy` before `/event/{id}`.
  return routes.sort((a, b) => a.names.length - b.names.length)
}

export const matchRoute = (routes, method, path) => {
  let pathMatched = false
  for (const route of routes) {
    const match = route.regexp.exec(path)
    if (!match) continue
    pathMatched = true
    if (route.method !== method && route.method !== 'ANY') continue
    const pathParameters = Object.fromEntries(route.names.map((name, i) => [name, match[i + 1]]))
    return { pathParameters, route }
  }
  return { pathMatched }
}

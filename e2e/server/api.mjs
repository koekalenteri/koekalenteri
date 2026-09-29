/**
 * The API Gateway stand-in: routes each request to the function the template names, imports that
 * function's built bundle (`dist/lambda/<Function>/handler.mjs`, the file deployed to Lambda) and
 * calls it with an `APIGatewayProxyEvent`. What API Gateway itself does is done here: the stage
 * prefix, CORS preflight, and the Cognito authorizer's claims.
 *
 * The authorizer is the one deliberate difference. The token's signature is not checked; its payload
 * becomes the claims, as API Gateway's would after checking it. Lambdas only ever read the claims.
 */
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { API_PORT, lambdaEnv, STAGE } from '../env.mjs'
import { matchRoute, readRoutes } from './routes.mjs'

Object.assign(process.env, lambdaEnv)

const DIST = path.resolve('dist')
const routes = await readRoutes(path.join(DIST, 'template.yaml'))

const CORS_HEADERS = {
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Client-Version,X-Registration-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,HEAD,GET,PUT,POST,PATCH,DELETE',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Max-Age': '3600',
}
const BINARY_TYPES = ['multipart/form-data', 'application/pdf']

const handlers = new Map()
const loadHandler = (functionName) => {
  if (!handlers.has(functionName)) {
    const file = pathToFileURL(path.join(DIST, 'lambda', functionName, 'handler.mjs')).href
    handlers.set(
      functionName,
      import(file).then((module) => module.default)
    )
  }
  return handlers.get(functionName)
}

/** The Cognito authorizer's claims from a Bearer token, or the reason API Gateway would refuse it. */
const claimsFrom = (authorization) => {
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const payload = token?.split('.')[1]
  if (!payload) return { error: 'Unauthorized' }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
      return { error: 'The incoming token has expired' }
    }
    // API Gateway hands every claim to the function as a string.
    return { claims: Object.fromEntries(Object.entries(claims).map(([key, value]) => [key, String(value)])) }
  } catch {
    return { error: 'Unauthorized' }
  }
}

/** Header names as the client sent them, which is what API Gateway passes on. */
const headersOf = (req) => {
  const headers = {}
  const multiValueHeaders = {}
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]
    const value = req.rawHeaders[i + 1]
    headers[name] = value
    multiValueHeaders[name] = [...(multiValueHeaders[name] ?? []), value]
  }
  return { headers, multiValueHeaders }
}

const queryOf = (url) => {
  if (!url.search) return { multiValueQueryStringParameters: null, queryStringParameters: null }
  const single = {}
  const multi = {}
  for (const [key, value] of url.searchParams) {
    single[key] = value
    multi[key] = [...(multi[key] ?? []), value]
  }
  return { multiValueQueryStringParameters: multi, queryStringParameters: single }
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const send = (res, statusCode, headers, body) => {
  res.writeHead(statusCode, headers)
  res.end(body)
}

const sendJson = (res, statusCode, body) =>
  send(res, statusCode, { ...CORS_HEADERS, 'Content-Type': 'application/json' }, JSON.stringify(body))

const lambdaContext = (functionName, requestId) => {
  const deadline = Date.now() + 60_000
  return {
    awsRequestId: requestId,
    callbackWaitsForEmptyEventLoop: false,
    functionName,
    functionVersion: '$LATEST',
    getRemainingTimeInMillis: () => Math.max(0, deadline - Date.now()),
    invokedFunctionArn: `arn:aws:lambda:eu-north-1:000000000000:function:${functionName}`,
    logGroupName: `/aws/lambda/${functionName}`,
    logStreamName: 'e2e',
    memoryLimitInMB: '1024',
  }
}

const handle = async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const stagePrefix = `/${STAGE}`
  if (url.pathname === '/_health') return send(res, 200, {}, 'ok')
  if (!url.pathname.startsWith(`${stagePrefix}/`))
    return sendJson(res, 403, { message: 'Missing Authentication Token' })

  // API Gateway matches `/event/` to the `/event` resource; the client asks with the slash.
  const resourcePath = url.pathname.slice(stagePrefix.length).replace(/(.)\/$/, '$1')
  const method = req.method ?? 'GET'
  if (method === 'OPTIONS') return send(res, 204, CORS_HEADERS)

  const { pathParameters, route, pathMatched } = matchRoute(routes, method, resourcePath)
  if (!route) return sendJson(res, pathMatched ? 405 : 403, { message: 'Missing Authentication Token' })

  const requestId = randomUUID()
  const requestContext = {
    httpMethod: method,
    identity: { sourceIp: req.socket.remoteAddress ?? '127.0.0.1', userAgent: req.headers['user-agent'] ?? '' },
    path: url.pathname,
    requestId,
    requestTimeEpoch: Date.now(),
    resourcePath: route.path,
    stage: STAGE,
  }
  if (route.authorized) {
    const { claims, error } = claimsFrom(req.headers.authorization)
    if (error) return sendJson(res, 401, { message: error })
    requestContext.authorizer = { claims }
  }

  const raw = await readBody(req)
  const contentType = req.headers['content-type'] ?? ''
  const isBase64Encoded = BINARY_TYPES.some((type) => contentType.startsWith(type))
  let body = null
  if (raw.length) body = isBase64Encoded ? raw.toString('base64') : raw.toString('utf8')

  const event = {
    body,
    httpMethod: method,
    isBase64Encoded,
    path: resourcePath,
    pathParameters: route.names.length ? pathParameters : null,
    ...queryOf(url),
    ...headersOf(req),
    requestContext,
    resource: route.path,
    stageVariables: null,
  }

  try {
    const handler = await loadHandler(route.functionName)
    const result = await handler(event, lambdaContext(route.functionName, requestId))
    const headers = { ...result.headers }
    for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) headers[name] = values
    const payload = result.isBase64Encoded ? Buffer.from(result.body ?? '', 'base64') : (result.body ?? '')
    send(res, result.statusCode, headers, payload)
  } catch (error) {
    // An exception that escapes the handler is a Lambda failure; API Gateway answers 502 for it.
    console.error(`${route.functionName} threw`, error)
    sendJson(res, 502, { message: 'Internal server error' })
  }
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error)
      if (!res.headersSent) sendJson(res, 500, { message: String(error) })
    })
  })
  .listen(API_PORT, () => console.log(`e2e api on :${API_PORT}, ${routes.length} routes`))

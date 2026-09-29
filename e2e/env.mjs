/**
 * The one place the browser tests' environment is written down: the ports, the frontend's build
 * variables and the variables the lambda bundles run with. The Playwright config, the build script
 * and the servers all read it, so a port cannot mean one thing to the browser and another to the API.
 */

export const FRONTEND_PORT = 3000
export const API_PORT = 8080
export const FAKES_PORT = 9000

/**
 * The lambdas answer CORS for exactly `http://localhost:3000` on the dev stage (`allowOrigin`), so
 * the frontend is served from that origin and the API is the dev stage.
 */
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
export const STAGE = 'dev'
export const API_URL = `http://localhost:${API_PORT}/${STAGE}`
export const FAKES_URL = `http://127.0.0.1:${FAKES_PORT}`

export const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'

/** The Cognito ids the frontend is built with. Nothing calls Cognito; they only have to be present. */
const USER_POOL_ID = 'eu-north-1_e2e'
const CLIENT_ID = 'e2eclient'

export const STACK_NAME = 'e2e'
export const PAYTRAIL_MERCHANT_ID = '375917'
export const PAYTRAIL_SECRET = 'e2e-paytrail-secret'

export const frontendBuildEnv = {
  BUILD_PATH: 'build-e2e',
  GENERATE_SOURCEMAP: 'false',
  REACT_APP_API_BASE_URL: API_URL,
  REACT_APP_CLIENT_ID: CLIENT_ID,
  REACT_APP_IDENTITY_POOL_ID: 'eu-north-1:e2e',
  REACT_APP_OAUTH_DOMAIN: 'localhost',
  REACT_APP_REDIRECT_SIGNIN: `${FRONTEND_URL}/login`,
  REACT_APP_REDIRECT_SIGNOUT: `${FRONTEND_URL}/logout`,
  REACT_APP_REGION: 'eu-north-1',
  REACT_APP_USER_POOL_ID: USER_POOL_ID,
  // No socket server runs here; an empty url keeps the client from reconnecting forever.
  REACT_APP_WS_API_URL: '',
}

/** The table variables as the template's Globals name them; CustomDynamoClient kebab-cases the values. */
const tableEnv = {
  AUDIT_TABLE_NAME: 'AuditTable',
  DATA_VERSION_TABLE_NAME: 'DataVersionTable',
  DOG_TABLE_NAME: 'DogTable',
  EMAIL_SUPPRESSION_TABLE_NAME: 'EmailSuppressionTable',
  EMAIL_TEMPLATE_TABLE_NAME: 'EmailTemplatesTable',
  EVENT_STATS_TABLE_NAME: 'EventStatsTable',
  EVENT_TABLE_NAME: 'EventTable',
  EVENT_TYPE_TABLE_NAME: 'EventTypeTable',
  JUDGE_TABLE_NAME: 'JudgeTable',
  LOCATION_TABLE_NAME: 'LocationTable',
  OFFICIAL_TABLE_NAME: 'OfficialTable',
  ORGANIZER_TABLE_NAME: 'OrganizerTable',
  REGISTRATION_TABLE_NAME: 'EventRegistrationTable',
  TRANSACTION_TABLE_NAME: 'TransactionTable',
  USER_LINK_TABLE_NAME: 'UserLinkTable',
  USER_TABLE_NAME: 'UserTable',
  WS_CONNECTIONS_TABLE_NAME: 'WsConnectionsTable',
}

/**
 * The environment the lambda bundles run in. Every AWS client inside them is pointed at a local
 * endpoint by the SDK's own `AWS_ENDPOINT_URL_<SERVICE>` variables, so no request leaves the machine.
 */
export const lambdaEnv = {
  ...tableEnv,
  // DynamoDB-local keeps one database per access key unless started with -sharedDb, which a CI
  // service container cannot be; init-tables.mjs and fixtures/db.ts use the same key.
  AWS_ACCESS_KEY_ID: 'local',
  AWS_EMF_ENVIRONMENT: 'Local',
  // Anything not named here would go to AWS; point the rest at the fakes, which answer 501 and log the call.
  AWS_ENDPOINT_URL: `${FAKES_URL}/aws`,
  AWS_ENDPOINT_URL_DYNAMODB: DYNAMODB_ENDPOINT,
  AWS_ENDPOINT_URL_SES: `${FAKES_URL}/ses`,
  AWS_ENDPOINT_URL_SSM: `${FAKES_URL}/ssm`,
  AWS_REGION: 'eu-north-1',
  AWS_SECRET_ACCESS_KEY: 'local',
  CUSTOM_DOMAIN: `localhost:${FRONTEND_PORT}`,
  PAYTRAIL_API_ENDPOINT: `${FAKES_URL}/paytrail`,
  REGISTRATION_EDIT_TOKEN_SECRET: 'e2e-registration-edit-token-secret',
  STACK_NAME,
  STAGE_NAME: STAGE,
  WS_API_ENDPOINT: `${FAKES_URL}/ws`,
}

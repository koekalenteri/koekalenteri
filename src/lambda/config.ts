export const CONFIG = {
  // TABLES
  auditTable: process.env.AUDIT_TABLE_NAME ?? 'audit-table-not-found-in-env',
  dogTable: process.env.DOG_TABLE_NAME ?? 'dog-table-not-found-in-env',
  emailFrom: process.env.EMAIL_FROM ?? 'koekalenteri@koekalenteri.snj.fi',
  emailTemplateTable: process.env.EMAIL_TEMPLATE_TABLE_NAME ?? 'email-template-table-not-found-in-env',
  eventStatsTable: process.env.EVENT_STATS_TABLE_NAME ?? 'event-stats-table-not-found-in-env',
  eventTable: process.env.EVENT_TABLE_NAME ?? 'event-table-not-found-in-env',
  eventTypeTable: process.env.EVENT_TYPE_TABLE_NAME ?? 'event-type-table-not-found-in-env',
  fileBucket: process.env.BUCKET ?? 'bucket-not-found-in-env',

  frontendURL: `https://${process.env.CUSTOM_DOMAIN ?? 'koekalenteri.snj.fi'}`,
  judgeTable: process.env.JUDGE_TABLE_NAME ?? 'judge-table-not-found-in-env',
  officialTable: process.env.OFFICIAL_TABLE_NAME ?? 'official-table-not-found-in-env',
  organizerTable: process.env.ORGANIZER_TABLE_NAME ?? 'organizer-table-not-found-in-env',
  registrationTable: process.env.REGISTRATION_TABLE_NAME ?? 'registration-table-not-found-in-env',
  stackName: process.env.AWS_SAM_LOCAL ? 'local' : (process.env.STACK_NAME ?? 'local'),
  stageName: process.env.STAGE_NAME ?? '',
  transactionTable: process.env.TRANSACTION_TABLE_NAME ?? 'transaction-table-not-found-in-env',
  userLinkTable: process.env.USER_LINK_TABLE_NAME ?? 'user-link-table-not-found-in-env',
  userTable: process.env.USER_TABLE_NAME ?? 'user-table-not-found-in-env',
  wsApiEndpoint: process.env.WS_API_ENDPOINT ?? 'ws-api-endpoint-not-found-in-env',
  wsConnectionsTable: process.env.WS_CONNECTIONS_TABLE_NAME ?? 'ws-connections-table-not-found-in-env',
}

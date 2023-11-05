export const CONFIG = {
  stackName: process.env.AWS_SAM_LOCAL ? 'local' : process.env.STACK_NAME ?? 'local',
  stageName: process.env.STAGE_NAME ?? '',

  // TODO: sender address from env / other config
  emailFrom: 'koekalenteri@koekalenteri.snj.fi',
  fileBucket: process.env.BUCKET ?? 'bucket-not-found-in-env',

  // TABLES
  auditTable: process.env.AUDIT_TABLE_NAME ?? 'audit-table-not-found-in-env',
  dogTable: process.env.DOG_TABLE_NAME ?? 'dog-table-not-found-in-env',
  emailTemplateTable: process.env.EMAIL_TEMPLATE_TABLE_NAME ?? 'email-template-table-not-found-in-env',
  eventTable: process.env.EVENT_TABLE_NAME ?? 'event-table-not-found-in-env',
  eventTypeTable: process.env.EVENT_TYPE_TABLE_NAME ?? 'event-type-table-not-found-in-env',
  judgeTable: process.env.JUDGE_TABLE_NAME ?? 'judge-table-not-found-in-env',
  officialTable: process.env.OFFICIAL_TABLE_NAME ?? 'official-table-not-found-in-env',
  organizerTable: process.env.ORGANIZER_TABLE_NAME ?? 'organizer-table-not-found-in-env',
  registrationTable: process.env.REGISTRATION_TABLE_NAME ?? 'registration-table-not-found-in-env',
  transactionTable: process.env.TRANSACTION_TABLE_NAME ?? 'transaction-table-not-found-in-env',
  userLinkTable: process.env.USER_LINK_TABLE_NAME ?? 'user-link-table-not-found-in-env',
  userTable: process.env.USER_TABLE_NAME ?? 'user-table-not-found-in-env',
}

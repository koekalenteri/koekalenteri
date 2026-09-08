/** The Service Desk form every piece of feedback goes through, from /support and from the guides alike. */
export const SUPPORT_REQUEST_URL = 'https://koekalenteri.atlassian.net/servicedesk/customer/portal/1/group/1/create/1'

export const SUPPORT_EMAIL = 'support@koekalenteri.atlassian.net'

/**
 * The form with its summary and description filled in. A guide's "this did not help" link names
 * the page, the version and the language, so the report says where the reader was without the
 * reader having to.
 */
export const supportRequestUrl = (summary: string, description: string) => {
  const params = new URLSearchParams({ description, summary })

  return `${SUPPORT_REQUEST_URL}?${params.toString()}`
}

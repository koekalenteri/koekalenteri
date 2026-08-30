// Weekly refresh of the Kennelliitto municipality list offered in the event form's location field.
// The list only really changes at the turn of the year, so a week of staleness costs nothing and
// the sync stays a cheap background job. See src/lambda/lib/locations.ts.
import { CONFIG } from '../config'
import KLAPI from '../lib/KLAPI'
import { fetchLocations, syncLocations } from '../lib/locations'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// exported for testing
export const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)

export default async function refreshLocations(): Promise<void> {
  const locations = await fetchLocations(new KLAPI(getKLAPIConfig))

  // Leave the previous snapshot in place: a bad KL response must not empty the option list. Throwing
  // is what surfaces the failed run in the error alarm.
  if (!locations?.length) throw new Error('refreshLocations: KLAPI returned no locations')

  if (await syncLocations(dynamoDB, locations)) {
    await publishAdminDataInvalidation(['locations'])
  }
}

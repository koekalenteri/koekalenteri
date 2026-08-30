// Weekly safety net for the version registry: recomputes what every collection version would have
// been and remints anything that changed without a bump. See src/lambda/lib/dataVersionRepair.ts.
import { repairDataVersions } from '../lib/dataVersionRepair'

export default repairDataVersions

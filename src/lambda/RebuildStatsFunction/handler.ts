// Scheduled nightly rebuild of every stats partition that has no other writer.
//
// Counting *distinct* dogs/handlers/breeds cannot be done incrementally without read-then-write
// under contention, so recomputing them in one pass is both simpler and drift-free. ORG# is
// deliberately excluded: it is still maintained on registration writes, and rebuilding it here
// would race them. See src/lambda/lib/statsRebuild.ts.
import { createHandler, REBUILDABLE_STATS_PARTITIONS } from '../lib/statsRebuild'

export default createHandler(REBUILDABLE_STATS_PARTITIONS)

// Scheduled nightly rebuild of every stats partition that has no other writer; why ORG# is not
// one of them: src/lambda/lib/stats/README.md.
import { createHandler, REBUILDABLE_STATS_PARTITIONS } from '../lib/stats/rebuild'

export default createHandler(REBUILDABLE_STATS_PARTITIONS)

// Despite its deployed name, this manual function regenerates *all* statistics, ORG# included.
//
// Rebuilding ORG# means deleting and rewriting records that registration writes also maintain,
// so a registration landing mid-run can be lost or double-counted. That is why this stays a
// deliberate manual invocation. The nightly RebuildStatsFunction covers everything else.
import { ALL_STATS_PARTITIONS, createHandler } from '../lib/statsRebuild'

export default createHandler(ALL_STATS_PARTITIONS)

// The manual rebuild of every stats partition, ORG# included; why it stays manual:
// src/lambda/lib/stats/README.md.
import { ALL_STATS_PARTITIONS, createHandler } from '../lib/stats/rebuild'

export default createHandler(ALL_STATS_PARTITIONS)

import { logger } from '../log'

/**
 * A live push follows a write that has already succeeded, so it never decides the outcome of that
 * write (KOE-1583). Whatever fails in it (an audience scan, a read it makes, a send) is logged as
 * `live push failed` with the publication's name, and the caller goes on: the open pages catch up at
 * their next fetch. Every publisher runs its push through this (the list is in `README.md`), so a
 * caller never guards one again. The `...Strict` publishers in `actions.ts` are the exception, for
 * a durable workflow whose retry is what delivers a failed push: they reject.
 *
 * A module of its own so that `auditPublisher.ts`, which `lib/audit.ts` loads everywhere, can use it
 * without loading `actions.ts` and the start list readers behind it.
 */
export const bestEffort = async (publication: string, push: () => Promise<unknown>): Promise<void> => {
  try {
    await push()
  } catch (error) {
    logger.error('live push failed', { error, publication })
  }
}

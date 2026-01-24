import { authorize } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { filterRelevantUsers, getAllUsers, userIsMemberOf } from '../lib/user'

function dedupeUsersByEmail<
  T extends {
    email?: string
    admin?: boolean
    officer?: unknown[]
    judge?: unknown[]
    roles?: Record<string, unknown>
    modifiedAt?: string
  },
>(users: T[]): T[] {
  const byEmail = new Map<string, T>()

  const score = (u: T) => {
    const rolesCount = Object.keys(u.roles ?? {}).length
    const officerCount = Array.isArray(u.officer) ? u.officer.length : 0
    const judgeCount = Array.isArray(u.judge) ? u.judge.length : 0
    const admin = u.admin ? 1000 : 0
    return admin + rolesCount * 10 + officerCount + judgeCount
  }

  for (const u of users) {
    // Some legacy/system users might not have email; keep them and avoid crashing.
    if (!u.email) {
      byEmail.set(`__no_email__:${byEmail.size}`, u)
      continue
    }

    const key = u.email.toLocaleLowerCase()
    const existing = byEmail.get(key)
    if (!existing) {
      byEmail.set(key, u)
      continue
    }

    // Prefer the most "capable" entry; if tied, prefer the most recently modified.
    const s1 = score(existing)
    const s2 = score(u)
    if (s2 > s1) {
      byEmail.set(key, u)
      continue
    }
    if (s2 === s1) {
      const t1 = existing.modifiedAt ? Date.parse(existing.modifiedAt) : 0
      const t2 = u.modifiedAt ? Date.parse(u.modifiedAt) : 0
      if (t2 > t1) byEmail.set(key, u)
    }
  }

  return [...byEmail.values()]
}

const getUsersLambda = lambda('getUsers', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const memberOf = userIsMemberOf(user)
  if (!memberOf.length && !user?.admin) {
    console.error(`User ${user.id} is not admin or member of any organizations.`)
    return response(403, 'Forbidden', event)
  }
  const users = await getAllUsers()

  const relevant = filterRelevantUsers(users, user, memberOf)
  const deduped = dedupeUsersByEmail(relevant)

  return response(200, deduped, event)
})

export default getUsersLambda

export const userHasAdminAccess = (user?: { admin?: boolean; roles?: Record<string, unknown> } | null): boolean =>
  user?.admin === true || Object.keys(user?.roles ?? {}).length > 0

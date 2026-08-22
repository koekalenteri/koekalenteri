# Recently updated highlights

This module tracks records that were changed by background updates, such as WebSocket patches, so views can briefly
highlight the corresponding UI element.

## Mark an update

Call `useMarkRecentlyUpdated()` in the code path that applies a background mutation:

```ts
const markRecentlyUpdated = useMarkRecentlyUpdated()
markRecentlyUpdated('admin:event', eventId)
```

Use stable scope names, such as `public:event`, `admin:event`, or `admin:registration`, to avoid collisions between
views that can render the same id in different contexts.

## Highlight a single component

Use `useIsRecentlyUpdated(scope, id)` and merge `recentUpdateSx` into the outer component style:

```tsx
const recentlyUpdated = useIsRecentlyUpdated('public:event', eventId)

return <Box sx={{ ...baseSx, ...(recentlyUpdated ? recentUpdateSx : {}) }} />
```

## Highlight DataGrid rows

Use `useRecentUpdateRowClassName(scope)` as `getRowClassName`. Shared row styling lives in `StyledDataGrid`.

```tsx
const getRowClassName = useRecentUpdateRowClassName('admin:event')

return <StyledDataGrid rows={events} getRowClassName={getRowClassName} />
```

import type { GridRowId, GridRowSelectionModel } from '@mui/x-data-grid'

const collator = new Intl.Collator('fi-FI')

export const rowSelectionModel = (ids: Iterable<GridRowId> = []): GridRowSelectionModel => ({
  ids: new Set(ids),
  type: 'include',
})

export const firstSelectedRow = (selection: GridRowSelectionModel): GridRowId | undefined =>
  selection.ids.values().next().value

export const localeSortComparator = (a?: string, b?: string) => {
  if (a) {
    return b ? collator.compare(a, b) : -1
  }
  return b ? 1 : 0
}

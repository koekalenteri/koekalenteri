import type { Theme } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

/**
 * The entry grid is far wider than a phone — a cancelled dog's row runs to some 950px where the
 * screen offers 391 — and the grids clip their own horizontal overflow, so nothing past the right
 * edge can be reached by any gesture. The actions kebab is the last column of all, which left a
 * secretary on a phone unable to refund a cancelled entry (KOE-1420).
 *
 * The kebab is pinned to the right edge instead. Where the grid fits its width, as it does on a
 * desktop, a sticky cell sits exactly where it always did.
 *
 * Columns slide underneath the pinned cell, so it has to paint its own background, and repeat the
 * row colours StyledDataGrid gives the rest of the row. Selected-and-hovered is spelled out rather
 * than left to source order, which the key sorting decides rather than this file.
 */
export const pinnedActionsColumnSx: SxProps<Theme> = {
  '& .MuiDataGrid-cell[data-field="actions"]': {
    backgroundColor: 'background.paper',
    position: 'sticky',
    right: 0,
    zIndex: 2,
  },
  '& .MuiDataGrid-columnHeader[data-field="actions"]': {
    position: 'sticky',
    right: 0,
    zIndex: 2,
  },
  '& .MuiDataGrid-row:hover > .MuiDataGrid-cell[data-field="actions"]': {
    backgroundColor: 'background.hover',
  },
  '& .MuiDataGrid-row.Mui-selected > .MuiDataGrid-cell[data-field="actions"]': {
    backgroundColor: 'background.selected',
  },
  '& .MuiDataGrid-row.Mui-selected:hover > .MuiDataGrid-cell[data-field="actions"]': {
    backgroundColor: 'background.hover',
  },
}

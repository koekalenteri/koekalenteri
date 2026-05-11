import type { AuditRecord } from '../../../types'
import Box from '@mui/material/Box'
import { formatDate } from '../../../i18n/dates'
import CollapsibleSection from '../../components/CollapsibleSection'
import { NullComponentWithRef } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'

interface Props {
  auditTrail?: AuditRecord[]
}

export const AuditTrail = ({ auditTrail }: Props) => {
  if (!auditTrail) return null

  const visibleRows = Math.min(Math.max(auditTrail.length, 1), 8)
  const gridHeight = visibleRows * 36 + 2

  return (
    <CollapsibleSection title={`Audit trail (${auditTrail.length})`} initOpen={false}>
      <Box sx={{ height: gridHeight, minHeight: gridHeight }}>
        <StyledDataGrid
          columnHeaderHeight={0}
          columns={[
            {
              field: 'timestamp',
              headerName: '',
              valueFormatter: (value) => formatDate(value, 'dd.MM.yyyy HH:mm:ss'), //formatDate(, 'dd.MM.yy HH:mm:ss'),
              width: 160,
            },
            {
              field: 'user',
              width: 160,
            },
            { field: 'message', flex: 1 },
          ]}
          density="compact"
          getRowId={(r) => r.timestamp.toISOString()}
          hideFooter
          rows={auditTrail}
          slots={{
            columnHeaders: NullComponentWithRef,
          }}
        />
      </Box>
    </CollapsibleSection>
  )
}

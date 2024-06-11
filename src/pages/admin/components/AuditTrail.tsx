import type { AuditRecord } from '../../../types'

import { formatDate } from '../../../i18n/dates'
import CollapsibleSection from '../../components/CollapsibleSection'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'

interface Props {
  auditTrail?: AuditRecord[]
}

export const AuditTrail = ({ auditTrail }: Props) => {
  if (!auditTrail) return null

  return (
    <CollapsibleSection title={`Audit trail (${auditTrail.length})`} initOpen={false}>
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
        autoHeight
        getRowId={(r) => r.timestamp.toISOString()}
        hideFooter
        rows={auditTrail}
        slots={{
          columnHeaders: NullComponent,
        }}
      />
    </CollapsibleSection>
  )
}

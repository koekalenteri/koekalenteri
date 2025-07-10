import type { ReactNode } from 'react'

import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

interface BasePlacesTableProps {
  headers: ReactNode[]
  children: ReactNode
}

export default function BasePlacesTable({ headers, children }: BasePlacesTableProps) {
  return (
    <Table size="small" sx={{ '& .MuiTextField-root': { m: 0, width: '10ch' } }}>
      <TableHead>
        <TableRow>
          {headers.map((header, index) => (
            <TableCell key={index} align={index > 0 ? 'center' : 'left'}>
              {header}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>{children}</TableBody>
    </Table>
  )
}

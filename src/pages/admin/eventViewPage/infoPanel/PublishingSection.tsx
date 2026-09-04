import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableContainer from '@mui/material/TableContainer'
import Typography from '@mui/material/Typography'
import { sectionSx } from './styles'

interface Props {
  /** The one button under the table, full width. */
  readonly action: ReactNode
  /** The table rows, one per class. */
  readonly children: ReactNode
  readonly title: string
}

/** A publishing step of the panel: a titled table of class rows with one action beneath it. */
export const PublishingSection = ({ action, children, title }: Props) => (
  <Box sx={sectionSx}>
    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
      {title}
    </Typography>
    <TableContainer>
      <Table>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
    <Box sx={{ pb: 1, pt: 0.5, px: 1 }}>{action}</Box>
  </Box>
)

import type { BoxProps } from '@mui/material'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import Table from '@mui/material/Table'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { GridFooterContainer } from '@mui/x-data-grid'

import { formatMoney } from '../../../../lib/money'
import { NumberInput } from '../../../components/NumberInput'

const FooterCell = (props: BoxProps) => <Box {...props} sx={{ mx: 3 }} />

interface RefundFooterProps {
  handlingCost: number
  onHandlingCostChange: (value?: number) => void
  total: number
  selectedTotal: number
}

declare module '@mui/x-data-grid' {
  interface FooterPropsOverrides extends RefundFooterProps {}
}

export const RefundFooter = ({ total, selectedTotal, handlingCost, onHandlingCostChange }: RefundFooterProps) => {
  const { t } = useTranslation()

  return (
    <GridFooterContainer>
      <FooterCell></FooterCell>
      <FooterCell>
        <Table size="small">
          <TableRow>
            <TableCell align="right">Tapahtumat yhteensä:</TableCell>
            <TableCell align="right">{formatMoney(total / 100)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell align="right">Valittuna yhteensä:</TableCell>
            <TableCell align="right">{formatMoney(selectedTotal / 100)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell align="right">Käsittelymaksu:</TableCell>
            <TableCell align="right">
              <NumberInput
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end" sx={{ m: 0 }}>
                      €
                    </InputAdornment>
                  ),
                  inputProps: {
                    style: { fontSize: 14 },
                  },
                }}
                onChange={onHandlingCostChange}
                value={handlingCost}
                variant="standard"
                error={handlingCost < 0}
                sx={{ width: 60, fontSize: 14, '.MuiInputBase-root': { fontSize: 14 } }}
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell align="right">Palautetaan:</TableCell>
            <TableCell align="right">
              <strong>{formatMoney(total / 100 - handlingCost)}</strong>
            </TableCell>
          </TableRow>
        </Table>
      </FooterCell>
    </GridFooterContainer>
  )
}

import type { BoxProps } from '@mui/material'
import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { GridFooterContainer } from '@mui/x-data-grid'
import { useCallback } from 'react'
import { formatMoney, formatMoneyWithoutCurrency } from '../../../../lib/money'
import { NumberInput } from '../../../components/NumberInput'

const FooterCell = (props: BoxProps) => <Box {...props} sx={{ mx: 0 }} />

interface RefundFooterProps {
  canHaveHandlingCosts: boolean
  handlingCost: number
  onHandlingCostChange: (value?: number) => void
  total: number
  selectedTotal: number
}

declare module '@mui/x-data-grid' {
  interface FooterPropsOverrides extends RefundFooterProps {
    blah?: never
  }
}

const ValueCell = styled(TableCell)(() => ({
  paddingRight: 10,
}))

export const RefundFooter = ({
  canHaveHandlingCosts,
  total,
  selectedTotal,
  handlingCost,
  onHandlingCostChange,
}: RefundFooterProps) => {
  const parseAmount = useCallback((value: string) => {
    return Math.round(Number.parseFloat(value.replaceAll(',', '.')) * 100)
  }, [])
  const formatAmount = useCallback((amount: number | undefined) => formatMoneyWithoutCurrency((amount ?? 0) / 100), [])

  const refundBase = Math.min(total, selectedTotal)
  const refundTotal = refundBase - handlingCost

  return (
    <GridFooterContainer>
      <FooterCell></FooterCell>
      <FooterCell>
        <Table size="small">
          <TableBody>
            <TableRow>
              <TableCell align="right">Tapahtumat yhteensä:</TableCell>
              <ValueCell align="right">{formatMoney(total / 100)}</ValueCell>
            </TableRow>
            <TableRow>
              <TableCell align="right">Käsittelykulu:</TableCell>
              <ValueCell align="right">
                <NumberInput
                  disabled={!canHaveHandlingCosts}
                  formatValue={formatAmount}
                  parseInput={parseAmount}
                  pattern={`[0-9]{1,3},[0-9]{2}`}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end" disableTypography sx={{ color: 'primary.main', m: 0 }}>
                          €
                        </InputAdornment>
                      ),
                      inputProps: {
                        style: { fontSize: 14 },
                      },
                    },
                  }}
                  onChange={onHandlingCostChange}
                  value={handlingCost}
                  variant="standard"
                  error={handlingCost < 0}
                  sx={{ '.MuiInputBase-root': { fontSize: 14 }, fontSize: 14, width: 60 }}
                />
              </ValueCell>
            </TableRow>
            <TableRow>
              <TableCell align="right">Palautetaan:</TableCell>
              <ValueCell
                align="right"
                sx={{
                  color: refundTotal !== 0 && handlingCost > refundBase ? 'error.main' : undefined,
                }}
              >
                <strong>{selectedTotal > 0 && refundTotal !== 0 ? formatMoney(refundTotal / 100) : '-'}</strong>
              </ValueCell>
            </TableRow>
          </TableBody>
        </Table>
      </FooterCell>
    </GridFooterContainer>
  )
}

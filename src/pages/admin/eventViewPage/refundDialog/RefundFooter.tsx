import type { BoxProps } from '@mui/material'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import Table from '@mui/material/Table'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { GridFooterContainer } from '@mui/x-data-grid'

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
  interface FooterPropsOverrides extends RefundFooterProps {}
}

const ValueCell = styled(TableCell)(() => ({
  'padding-right': 10,
}))

export const RefundFooter = ({
  canHaveHandlingCosts,
  total,
  selectedTotal,
  handlingCost,
  onHandlingCostChange,
}: RefundFooterProps) => {
  const { t } = useTranslation()
  const parseAmount = useCallback((value: string) => {
    return Math.round(parseFloat(value.replace(',', '.')) * 100)
  }, [])
  const formatAmount = useCallback((amount: number | undefined) => formatMoneyWithoutCurrency((amount ?? 0) / 100), [])

  return (
    <GridFooterContainer>
      <FooterCell></FooterCell>
      <FooterCell>
        <Table size="small">
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
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end" disableTypography sx={{ m: 0, color: 'primary.main' }}>
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
            </ValueCell>
          </TableRow>
          <TableRow>
            <TableCell align="right">Palautetaan:</TableCell>
            <ValueCell align="right" sx={{ color: handlingCost > selectedTotal ? 'error.main' : undefined }}>
              <strong>{formatMoney((selectedTotal - handlingCost) / 100)}</strong>
            </ValueCell>
          </TableRow>
        </Table>
      </FooterCell>
    </GridFooterContainer>
  )
}

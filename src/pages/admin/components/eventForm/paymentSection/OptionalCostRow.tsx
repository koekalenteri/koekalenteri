import type { DogEventCost } from '../../../../../types/Cost'
import type { PartialEvent } from '../types'

import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import { NumberInput } from '../../../../components/NumberInput'

interface OptionalCostRowProps {
  event: PartialEvent
  index: number
  error: boolean
  onRemove: (index: number) => void
  onEditDescription: (index: number) => void
  onCostChange: (costKey: 'cost' | 'costMember', index: number, value: number | undefined) => void
}

export const OptionalCostRow = ({
  event,
  index,
  error,
  onRemove,
  onEditDescription,
  onCostChange,
}: OptionalCostRowProps) => {
  const { t } = useTranslation()
  const optCost = (event.cost as DogEventCost).optionalAdditionalCosts?.[index]

  if (!optCost) {
    return null
  }

  return (
    <>
      <TableRow sx={{ '& td': { borderBottom: error ? 0 : undefined } }}>
        <TableCell>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span>{optCost.description.fi}</span>
            <IconButton data-testid={`edit-optional-${index}`} size="small" onClick={() => onEditDescription(index)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </div>
        </TableCell>
        <TableCell align="right">
          <NumberInput
            data-testid={`cost.optionalAdditionalCosts.${index}`}
            name={`cost.optionalAdditionalCosts.${index}`}
            value={optCost.cost}
            onChange={(v) => onCostChange('cost', index, v)}
            error={error}
          />
        </TableCell>
        <TableCell align="right">
          <NumberInput
            data-testid={`costMember.optionalAdditionalCosts.${index}`}
            name={`costMember.optionalAdditionalCosts.${index}`}
            value={(event.costMember as DogEventCost).optionalAdditionalCosts?.[index]?.cost ?? optCost.cost}
            onChange={(v) => onCostChange('costMember', index, v)}
            error={error}
          />
        </TableCell>
        <TableCell>
          <IconButton onClick={() => onRemove(index)}>
            <DeleteOutline />
          </IconButton>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow sx={{ '& td': { borderTop: 0, py: 0 } }}>
          <TableCell colSpan={3}>
            <FormHelperText error sx={{ m: 0 }}>
              {t('validation.event.costMemberHigh')}
            </FormHelperText>
          </TableCell>
          <TableCell />
        </TableRow>
      )}
    </>
  )
}

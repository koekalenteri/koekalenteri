import type { BreedCode } from '../../../../../types'
import type { DogEventCost, DogEventCostKey } from '../../../../../types/Cost'
import type { PartialEvent } from '../types'

import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

import { getCostValue } from '../../../../../lib/cost'
import { NumberInput } from '../../../../components/NumberInput'

interface CostRowProps {
  costKey: DogEventCostKey
  event: PartialEvent
  breedCode?: BreedCode
  onEditDescription: (key: DogEventCostKey) => void
  onRemove: (key: DogEventCostKey, breedCode?: BreedCode) => void
  onEarlyBirdDaysChange: (days: number | undefined) => void
  onCostChange: (key: string, value: number | undefined) => void
}

export const CostRow = ({
  costKey,
  event,
  breedCode,
  onEditDescription,
  onRemove,
  onEarlyBirdDaysChange,
  onCostChange,
}: CostRowProps) => {
  const { t } = useTranslation()

  const renderCellContent = () => {
    if (costKey === 'custom') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span>{(event.cost as DogEventCost)?.custom?.description?.fi ?? t('costNames.custom')}</span>
            <IconButton size="small" onClick={() => onEditDescription('custom')}>
              <EditIcon fontSize="small" />
            </IconButton>
          </div>
          <Box sx={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'text.secondary', mt: 0.5 }}>
            {t('costDescription.custom')}
          </Box>
        </div>
      )
    }

    if (costKey === 'earlyBird') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>{t(`costNames.${costKey}`, { days: (event.cost as DogEventCost)?.earlyBird?.days ?? 0 })}</span>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
            <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', mr: 1 }}>
              {t('costDescription.earlyBirdDays')}:
            </Box>
            <NumberInput
              name="earlyBirdDays"
              value={(event.cost as DogEventCost)?.earlyBird?.days ?? 0}
              onChange={onEarlyBirdDaysChange}
              sx={{ width: '6ch !important' }}
            />
          </div>
        </div>
      )
    }

    return t(`costNames.${costKey}`, { code: breedCode })
  }

  const innerKey = costKey === 'breed' && breedCode ? `breed.${breedCode}` : costKey
  const costPath = `cost.${innerKey}`
  const memberCostPath = `costMember.${innerKey}`

  return (
    <TableRow key={costKey}>
      <TableCell>{renderCellContent()}</TableCell>
      <TableCell align="right">
        <NumberInput
          name={costPath}
          value={getCostValue(event.cost ?? 0, costKey, breedCode)}
          onChange={(v) => onCostChange(costPath, v)}
        />
      </TableCell>
      <TableCell align="right">
        <NumberInput
          name={memberCostPath}
          value={getCostValue(event.costMember ?? 0, costKey, breedCode)}
          onChange={(v) => onCostChange(memberCostPath, v)}
        />
      </TableCell>
      <TableCell>
        <IconButton disabled={costKey === 'normal'} onClick={() => onRemove(costKey, breedCode)}>
          <DeleteOutline />
        </IconButton>
      </TableCell>
    </TableRow>
  )
}

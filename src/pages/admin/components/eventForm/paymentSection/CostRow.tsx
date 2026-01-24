import type { BreedCode } from '../../../../../types'
import type { DogEventCost, DogEventCostKey } from '../../../../../types/Cost'
import type { PartialEvent } from '../types'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { getCostValue, getEarlyBirdDates } from '../../../../../lib/cost'
import { NumberInput } from '../../../../components/NumberInput'

interface CostRowProps {
  costKey: DogEventCostKey
  event: PartialEvent
  breedCode?: BreedCode
  error?: boolean
  onEditDescription: (key: DogEventCostKey) => void
  onRemove: (key: DogEventCostKey, breedCode?: BreedCode) => void
  onEarlyBirdDaysChange: (days: number | undefined) => void
  onCostChange: (key: string, value: number | undefined) => void
}

export const CostRow = ({
  costKey,
  event,
  breedCode,
  error,
  onEditDescription,
  onRemove,
  onEarlyBirdDaysChange,
  onCostChange,
}: CostRowProps) => {
  const { t } = useTranslation()

  const innerKey = costKey === 'breed' && breedCode ? `breed.${breedCode}` : costKey
  const costPath = `cost.${innerKey}`
  const memberCostPath = `costMember.${innerKey}`

  const renderCellContent = () => {
    if (costKey === 'custom') {
      return (
        <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column' }}>
          <div style={{ alignItems: 'center', display: 'flex' }}>
            <span>{t('costNames.custom', { name: (event.cost as DogEventCost)?.custom?.description?.fi })}</span>
            <IconButton size="small" data-testid={`${costPath}-edit`} onClick={() => onEditDescription('custom')}>
              <EditIcon fontSize="small" />
            </IconButton>
          </div>
        </div>
      )
    }

    if (costKey === 'earlyBird') {
      return (
        <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column' }}>
          <span>
            {t(`costNames.${costKey}`, {
              days: (event.cost as DogEventCost)?.earlyBird?.days ?? 0,
              ...getEarlyBirdDates(event, event.cost as DogEventCost),
            })}
          </span>
          <div style={{ alignItems: 'center', display: 'flex', marginTop: '4px' }}>
            <Box sx={{ color: 'text.secondary', fontSize: '0.75rem', mr: 1 }}>{t('costDescription.earlyBirdDays')}</Box>
            <NumberInput
              name="earlyBirdDays"
              data-testid="earlyBirdDays"
              value={(event.cost as DogEventCost)?.earlyBird?.days ?? 0}
              onChange={onEarlyBirdDaysChange}
              sx={{ width: '6ch !important' }}
            />
            <Box sx={{ color: 'text.secondary', fontSize: '0.75rem', ml: 1 }}>
              {t('costDescription.earlyBirdDaysUnit')}
            </Box>
          </div>
        </div>
      )
    }

    return t(`costNames.${costKey}`, { code: breedCode })
  }

  return (
    <>
      <TableRow key={costKey} sx={{ '& td': { borderBottom: error ? 0 : undefined } }}>
        <TableCell>{renderCellContent()}</TableCell>
        <TableCell align="right">
          <NumberInput
            name={costPath}
            data-testid={costPath}
            value={getCostValue(event.cost ?? 0, costKey, breedCode)}
            onChange={(v) => onCostChange(costPath, v)}
            error={error}
          />
        </TableCell>
        <TableCell align="right">
          <NumberInput
            name={memberCostPath}
            data-testid={memberCostPath}
            value={getCostValue(event.costMember ?? 0, costKey, breedCode)}
            onChange={(v) => onCostChange(memberCostPath, v)}
            error={error}
          />
        </TableCell>
        <TableCell>
          <IconButton
            disabled={costKey === 'normal'}
            data-testid={`${costPath}-delete`}
            onClick={() => onRemove(costKey, breedCode)}
          >
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

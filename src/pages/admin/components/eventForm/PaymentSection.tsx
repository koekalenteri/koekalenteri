import type { ValidationError } from '../../../../i18n/validation'
import type { BreedCode } from '../../../../types'
import type { DogEventCost, DogEventCostKey } from '../../../../types/Cost'
import type { PartialEvent, SectionProps } from './types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid2'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import { DOG_EVENT_COST_KEYS, setCostValue } from '../../../../lib/cost'
import { keysOf } from '../../../../lib/typeGuards'
import CollapsibleSection from '../../../components/CollapsibleSection'

import { AddCostDialog } from './paymentSection/AddCostDialog'
import { CostRow } from './paymentSection/CostRow'
import { EditCostDescriptionDialog } from './paymentSection/EditCostDescriptionDialog'
import { OptionalCostRow } from './paymentSection/OptionalCostRow'

// Define the order for cost types
const COST_TYPE_ORDER: Record<string, number> = {
  normal: 1,
  earlyBird: 2,
  breed: 4,
  custom: 5,
  // optionalAdditionalCosts are handled separately
}

const costSort = (a: string, b: string) => {
  // Sort by the defined order, or put unknown types at the end
  const orderA = COST_TYPE_ORDER[a] || 999
  const orderB = COST_TYPE_ORDER[b] || 999
  return orderA - orderB
}

export default function PaymentSection({
  disabled: _disabled,
  errorStates,
  event,
  fields: _fields,
  onChange,
  open,
  onOpenChange,
  errors,
}: Readonly<SectionProps>) {
  const { t } = useTranslation()
  const [dialogMode, setDialogMode] = useState<'optional' | 'other' | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingCostKey, setEditingCostKey] = useState<DogEventCostKey | null>(null)
  const [editingOptionalIndex, setEditingOptionalIndex] = useState<number | null>(null)
  const [editingDescriptions, setEditingDescriptions] = useState<{ fi: string; en?: string }>({ fi: '' })
  const error = errorStates?.cost ?? errorStates?.costMember
  const helperText = error ? t('validation.event.errors') : ''
  const costErrorList = useMemo(
    () =>
      errors
        ?.filter((e): e is ValidationError<PartialEvent, 'event'> => e !== false && e.key === 'costMemberHigh')
        .flatMap((e) => e.opts.list)
        .filter(Boolean) ?? [],
    [errors]
  )
  const optionalAdditionalCosts = (typeof event.cost === 'object' && event.cost.optionalAdditionalCosts) || []

  useEffect(() => {
    const clean = (cost: DogEventCost | number | undefined) => {
      if (typeof cost !== 'object' || !cost.breed) {
        return cost
      }

      const originalKeys = Object.keys(cost.breed)
      const cleanedBreed = Object.fromEntries(Object.entries(cost.breed).filter(([key]) => /^\d+$/.test(key)))

      if (Object.keys(cleanedBreed).length !== originalKeys.length) {
        return { ...cost, breed: cleanedBreed }
      }

      return cost
    }

    const newCost = clean(event.cost)
    const newCostMember = clean(event.costMember)

    if (newCost !== event.cost || newCostMember !== event.costMember) {
      onChange?.({ cost: newCost, costMember: newCostMember })
    }
  }, [event.cost, event.costMember, onChange])

  // Set default payment time to 'registration' if not defined
  useEffect(() => {
    if (event.paymentTime === undefined) {
      onChange?.({ paymentTime: 'registration' })
    }
  }, [event.paymentTime, onChange])

  const eventCostKeys: DogEventCostKey[] = useMemo(() => {
    const cost = event.cost
    if (typeof cost !== 'object') return ['normal']
    return Object.keys(cost) as DogEventCostKey[]
  }, [event.cost])

  const availableEventCostKeys = useMemo(
    () =>
      DOG_EVENT_COST_KEYS.filter(
        (key) => !eventCostKeys.includes(key) || key === 'breed' || key === 'optionalAdditionalCosts'
      ),
    [eventCostKeys]
  )

  const otherAvailableKeys = useMemo(
    () => availableEventCostKeys.filter((k) => k !== 'optionalAdditionalCosts'),
    [availableEventCostKeys]
  )

  const handleAdd = useCallback(
    (key: DogEventCostKey, data?: any) => {
      const cost: DogEventCost =
        typeof event.cost !== 'object' ? { normal: event.cost ?? 0 } : { ...(event.cost ?? {}) }
      const costMember: DogEventCost =
        typeof event.costMember !== 'object' ? { normal: event.costMember ?? 0 } : { ...(event.costMember ?? {}) }

      if (key === 'optionalAdditionalCosts') {
        const newOptionalCost = {
          cost: 0,
          description: data.description ?? { fi: 'Uusi vapaaehtoinen maksu', en: 'New optional cost' },
        }
        const newCost = { ...cost }
        newCost.optionalAdditionalCosts = [...(newCost.optionalAdditionalCosts ?? []), newOptionalCost]
        const newCostMember = { ...costMember }
        newCostMember.optionalAdditionalCosts = [...(newCostMember.optionalAdditionalCosts ?? []), newOptionalCost]
        onChange?.({ cost: newCost, costMember: newCostMember })
      } else {
        onChange?.({ cost: setCostValue(cost, key, 0, data), costMember: setCostValue(costMember, key, 0, data) })
      }
    },
    [event.cost, event.costMember, onChange]
  )

  const handleRemove = useCallback(
    (key: DogEventCostKey, breedCode?: BreedCode) => {
      const cost: DogEventCost =
        typeof event.cost !== 'object' ? { normal: event.cost ?? 0 } : { ...(event.cost ?? {}) }
      const costMember: DogEventCost =
        typeof event.costMember !== 'object' ? { normal: event.costMember ?? 0 } : { ...(event.costMember ?? {}) }

      if (key === 'breed' && breedCode) {
        if (cost.breed) delete cost.breed[breedCode]
        if (costMember.breed) delete costMember.breed[breedCode]
      } else {
        delete cost[key]
        delete costMember[key]
      }
      onChange?.({ cost, costMember })
    },
    [event.cost, event.costMember, onChange]
  )

  const handleRemoveOptional = useCallback(
    (index: number) => {
      const cost = { ...(event.cost as DogEventCost) }
      const costMember = { ...(event.costMember as DogEventCost) }

      cost.optionalAdditionalCosts = [...(cost.optionalAdditionalCosts ?? [])]
      cost.optionalAdditionalCosts.splice(index, 1)

      costMember.optionalAdditionalCosts = [...(costMember.optionalAdditionalCosts ?? [])]
      costMember.optionalAdditionalCosts.splice(index, 1)

      onChange?.({ cost, costMember })
    },
    [event.cost, event.costMember, onChange]
  )

  const handleEditDescription = useCallback(
    (key: DogEventCostKey) => {
      const cost = event.cost as DogEventCost
      let descriptions: { fi: string; en?: string } = { fi: '' }

      if (key === 'custom' && cost.custom?.description) {
        descriptions = { ...cost.custom.description }
      }

      setEditingCostKey(key)
      setEditingDescriptions(descriptions)
      setEditDialogOpen(true)
    },
    [event.cost]
  )

  const handleSaveDescription = useCallback(
    (key: DogEventCostKey, descriptions: { fi: string; en?: string }) => {
      const cost: DogEventCost =
        typeof event.cost !== 'object' ? { normal: event.cost ?? 0 } : { ...(event.cost ?? {}) }
      const costMember: DogEventCost =
        typeof event.costMember !== 'object' ? { normal: event.costMember ?? 0 } : { ...(event.costMember ?? {}) }

      if (key === 'custom' && cost.custom) {
        cost.custom = { ...cost.custom, description: descriptions }
        if (costMember.custom) {
          costMember.custom = { ...costMember.custom, description: descriptions }
        }
      }

      onChange?.({ cost, costMember })
    },
    [event.cost, event.costMember, onChange]
  )

  const handleEditOptionalDescription = useCallback(
    (index: number) => {
      const cost = event.cost as DogEventCost
      const description = cost.optionalAdditionalCosts?.[index]?.description ?? { fi: '' }
      setEditingOptionalIndex(index)
      setEditingDescriptions({ ...description })
      setEditDialogOpen(true)
    },
    [event.cost]
  )

  const handleSaveOptionalDescription = useCallback(
    (_key: DogEventCostKey, descriptions: { fi: string; en?: string }) => {
      if (editingOptionalIndex === null) return

      const cost = { ...(event.cost as DogEventCost) }
      const costMember = { ...(event.costMember as DogEventCost) }

      cost.optionalAdditionalCosts = [...(cost.optionalAdditionalCosts ?? [])]
      if (cost.optionalAdditionalCosts[editingOptionalIndex]) {
        cost.optionalAdditionalCosts[editingOptionalIndex] = {
          ...cost.optionalAdditionalCosts[editingOptionalIndex],
          description: descriptions,
        }
      }
      costMember.optionalAdditionalCosts = [...(costMember.optionalAdditionalCosts ?? [])]
      if (costMember.optionalAdditionalCosts[editingOptionalIndex]) {
        costMember.optionalAdditionalCosts[editingOptionalIndex] = {
          ...costMember.optionalAdditionalCosts[editingOptionalIndex],
          description: descriptions,
        }
      }

      onChange?.({ cost, costMember })
    },
    [editingOptionalIndex, event.cost, event.costMember, onChange]
  )

  const handleChange = useCallback(
    (key: string, value: number | undefined) => {
      const [costKey, property, breedCode] = key.split('.') as ['cost' | 'costMember', DogEventCostKey, BreedCode]
      const current: DogEventCost | number = event[costKey] ?? 0
      const cost = typeof current !== 'object' ? { normal: current } : { ...current }

      onChange?.({ [costKey]: setCostValue(cost, property, value ?? 0, { breedCode }) })
    },
    [event, onChange]
  )

  const handleEarlyBirdDaysChange = useCallback(
    (days: number | undefined) => {
      const costCurrent: DogEventCost | number = event.cost ?? 0
      const costMemberCurrent: DogEventCost | number = event.costMember ?? 0

      const cost = typeof costCurrent !== 'object' ? { normal: costCurrent } : { ...costCurrent }
      const costMember =
        typeof costMemberCurrent !== 'object' ? { normal: costMemberCurrent } : { ...costMemberCurrent }

      if (cost.earlyBird) {
        cost.earlyBird = { ...cost.earlyBird, days: days ?? 0 }
      }

      if (costMember.earlyBird) {
        costMember.earlyBird = { ...costMember.earlyBird, days: days ?? 0 }
      }

      onChange?.({ cost, costMember })
    },
    [event.cost, event.costMember, onChange]
  )

  const handleOptionalChange = useCallback(
    (costKey: 'cost' | 'costMember', index: number, value: number | undefined) => {
      const current: DogEventCost | number = event[costKey] ?? 0
      const cost = typeof current !== 'object' ? { normal: current } : { ...current }
      const newOptionalCosts = [...(cost.optionalAdditionalCosts ?? [])]
      if (newOptionalCosts[index]) {
        newOptionalCosts[index] = { ...newOptionalCosts[index], cost: value ?? 0 }
        cost.optionalAdditionalCosts = newOptionalCosts
        onChange?.({ [costKey]: cost })
      }
    },
    [event, onChange]
  )

  return (
    <CollapsibleSection
      title={t('paymentDetails')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid container spacing={1} maxWidth={1280}>
        <Grid minWidth={600}>
          <FormControl fullWidth>
            <InputLabel id="payment-time-label">{t('paymentTime')}</InputLabel>
            <Select
              labelId="payment-time-label"
              id="payment-time"
              value={event.paymentTime ?? 'registration'}
              label={t('paymentTime')}
              onChange={(e) => onChange?.({ paymentTime: e.target.value as 'registration' | 'confirmation' })}
            >
              <MenuItem value="registration">{t('paymentTimeOptions.registration')}</MenuItem>
              <MenuItem value="confirmation">{t('paymentTimeOptions.confirmation')}</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid minWidth={600} width="100%">
          <TableContainer>
            <Table size="small" sx={{ '& .MuiTextField-root': { m: 0, width: '10ch' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('cost')}</TableCell>
                  <TableCell align="right" width={100}>
                    {t('costAmount')}
                  </TableCell>
                  <TableCell align="right" width={130}>
                    {t('costMemberAmount')}
                  </TableCell>
                  <TableCell width={40}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eventCostKeys
                  .filter((key) => key !== 'optionalAdditionalCosts')
                  .sort(costSort)
                  .flatMap((key) => {
                    if (key === 'breed') {
                      const breeds = (event.cost as DogEventCost).breed ?? {}
                      return Object.keys(breeds).map((breedCode) => (
                        <CostRow
                          key={`${key}-${breedCode}`}
                          costKey={key}
                          event={event}
                          breedCode={breedCode as BreedCode}
                          onEditDescription={handleEditDescription}
                          onRemove={handleRemove}
                          onEarlyBirdDaysChange={handleEarlyBirdDaysChange}
                          onCostChange={handleChange}
                          error={costErrorList.includes(`breed[${breedCode}]`)}
                        />
                      ))
                    }
                    return (
                      <CostRow
                        key={key}
                        costKey={key}
                        event={event}
                        onEditDescription={handleEditDescription}
                        onRemove={handleRemove}
                        onEarlyBirdDaysChange={handleEarlyBirdDaysChange}
                        onCostChange={handleChange}
                        error={costErrorList.includes(key)}
                      />
                    )
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" justifyContent="end" p={1}>
            <Button variant="outlined" onClick={() => setDialogMode('other')} startIcon={<AddIcon />}>
              {t('costAdd')}
            </Button>
          </Stack>
          <br />
          <TableContainer>
            <Table size="small" sx={{ '& .MuiTextField-root': { m: 0, width: '10ch' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('costNames.optionalAdditionalCosts')}</TableCell>
                  <TableCell align="right" width={100}>
                    {t('costAmount')}
                  </TableCell>
                  <TableCell align="right" width={130}>
                    {t('costMemberAmount')}
                  </TableCell>
                  <TableCell width={40}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {optionalAdditionalCosts.map((_optCost, index) => (
                  <OptionalCostRow
                    key={`optional-${index}`}
                    event={event}
                    index={index}
                    onRemove={handleRemoveOptional}
                    onEditDescription={handleEditOptionalDescription}
                    onCostChange={handleOptionalChange}
                    error={costErrorList.includes(`optionalAdditionalCosts[${index}]`)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" justifyContent="end" p={1}>
            <Button variant="outlined" onClick={() => setDialogMode('optional')} startIcon={<AddIcon />}>
              {t('costAddOptional')}
            </Button>
          </Stack>
        </Grid>
      </Grid>
      <AddCostDialog
        open={dialogMode !== null}
        mode={dialogMode}
        onClose={() => setDialogMode(null)}
        availableKeys={otherAvailableKeys}
        existingBreedCodes={typeof event.cost === 'object' && event.cost.breed ? keysOf(event.cost.breed) : []}
        onAdd={handleAdd}
      />
      <EditCostDescriptionDialog
        open={editDialogOpen}
        costKey={editingCostKey ?? 'optionalAdditionalCosts'}
        initialDescriptions={editingDescriptions}
        onClose={() => {
          setEditDialogOpen(false)
          setEditingCostKey(null)
          setEditingOptionalIndex(null)
        }}
        onSave={editingCostKey ? handleSaveDescription : handleSaveOptionalDescription}
      />
    </CollapsibleSection>
  )
}

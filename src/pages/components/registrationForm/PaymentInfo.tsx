import type { DeepPartial, PublicConfirmedEvent, Registration } from '../../../types'
import type { CostResult, DogEventCostSegment } from '../../../types/Cost'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'

import { getCostSegmentName, getCostValue } from '../../../lib/cost'
import CollapsibleSection from '../CollapsibleSection'

interface Props {
  readonly event: PublicConfirmedEvent
  readonly registration: DeepPartial<Registration>
  readonly cost: CostResult
  readonly disabled?: boolean
  readonly onChange?: (props: DeepPartial<Registration>) => void
}

const PaymentInfo = ({ event, registration, cost, disabled, onChange }: Props) => {
  const { t } = useTranslation()
  const { cost: eventCost } = event

  const handleCostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.({ selectedCost: event.target.value as DogEventCostSegment })
  }

  const handleOptionalCostChange = (checked: boolean, index: number) => {
    const costs = registration.optionalCosts?.slice() ?? []
    if (checked) {
      costs.push(index)
    } else {
      const i = costs.indexOf(index)
      if (i > -1) {
        costs.splice(i, 1)
      }
    }
    onChange?.({ optionalCosts: costs })
  }

  if (typeof eventCost !== 'object') {
    return null
  }

  const open = !!registration.dog?.regNo
  const segments: DogEventCostSegment[] = ['normal', 'earlyBird', 'breed']
  const breedCode = registration.dog?.breedCode

  return (
    <CollapsibleSection
      title={t('registration.payment')}
      open={open}
      error={!open}
      helperText={!open ? t('validation.registration.choose', { field: 'dog' }) : undefined}
    >
      <RadioGroup value={cost.segment} onChange={handleCostChange}>
        {segments.map((segment) => {
          const value = getCostValue(eventCost, segment, breedCode)
          if (!value) return null
          return (
            <FormControlLabel
              key={segment}
              value={segment}
              disabled={disabled}
              control={<Radio />}
              label={`${t(getCostSegmentName(segment), { code: breedCode })} (${value}€)`}
            />
          )
        })}
        {eventCost.custom && (
          <FormControlLabel
            value="custom"
            disabled={disabled || !eventCost.custom}
            control={<Radio />}
            label={`${eventCost.custom.description.fi} (${eventCost.custom.cost}€)`}
          />
        )}
      </RadioGroup>
      {cost.cost?.optionalAdditionalCosts?.map((c, index) => (
        <Box key={index}>
          <FormControlLabel
            control={
              <Checkbox
                checked={registration.optionalCosts?.includes(index)}
                onChange={(e) => handleOptionalCostChange(e.target.checked, index)}
              />
            }
            label={`${c.description.fi} (${c.cost}€)`}
          />
        </Box>
      ))}
    </CollapsibleSection>
  )
}

export default PaymentInfo

import type { DeepPartial, PublicConfirmedEvent, Registration } from '../../../types'
import type { CostResult, DogEventCostSegment } from '../../../types/Cost'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName, getCostValue, getEarlyBirdDates, getStragegyBySegment } from '../../../lib/cost'
import { formatMoney } from '../../../lib/money'
import { isMember } from '../../../lib/registration'
import { isMinimalRegistrationForCost } from '../../../lib/typeGuards'
import { languageAtom } from '../../recoil'
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
  const language = useRecoilValue(languageAtom)
  const appliedCost = cost.cost ?? event.cost

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

  useEffect(() => {
    if (registration.selectedCost === undefined && cost.segment !== 'legacy') {
      onChange?.({ selectedCost: cost.segment, optionalCosts: [] })
    }
    if (cost.segment === 'legacy' && (registration.selectedCost || registration.optionalCosts)) {
      onChange?.({ selectedCost: undefined, optionalCosts: undefined })
    }
  }, [registration, cost])

  useEffect(() => {
    if (registration.language !== language) {
      onChange?.({ language })
    }
  }, [registration.language, language])

  if (typeof appliedCost !== 'object' || !isMinimalRegistrationForCost(registration)) {
    return null
  }

  const open = !!registration.dog?.breedCode
  const segments: DogEventCostSegment[] = ['normal', 'earlyBird', 'breed', 'custom']
  const breedCode = registration.dog?.breedCode
  const member = isMember(registration) ? ` ${t('costForMembers')}` : ''

  return (
    <>
      <CollapsibleSection
        title={t('cost')}
        open={open}
        error={!open}
        helperText={!open ? t('validation.registration.choose', { field: 'dog' }) : undefined}
      >
        <RadioGroup value={cost.segment} onChange={handleCostChange}>
          {segments.map((segment) => {
            const value = getCostValue(appliedCost, segment, breedCode)
            if (!value) return null
            const strategy = getStragegyBySegment(segment)
            return (
              <FormControlLabel
                key={segment}
                value={segment}
                disabled={disabled || !strategy?.isApplicable(appliedCost, registration, event)}
                control={<Radio />}
                label={`${t(getCostSegmentName(segment), {
                  code: breedCode,
                  name: appliedCost.custom?.description[language] || appliedCost.custom?.description.fi,
                  ...getEarlyBirdDates(event, appliedCost),
                })}${member} ${formatMoney(value)}`}
              />
            )
          })}
        </RadioGroup>
      </CollapsibleSection>
      {cost.cost?.optionalAdditionalCosts?.length ? (
        <CollapsibleSection
          title={t('costNames.optionalAdditionalCosts')}
          open={open}
          error={!open}
          helperText={!open ? t('validation.registration.choose', { field: 'dog' }) : undefined}
        >
          {cost.cost?.optionalAdditionalCosts?.map((c, index) => (
            <Box key={c.description.fi}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={registration.optionalCosts?.includes(index)}
                    onChange={(e) => handleOptionalCostChange(e.target.checked, index)}
                  />
                }
                disabled={disabled}
                label={`${c.description[language] || c.description.fi} (${formatMoney(c.cost)})`}
              />
            </Box>
          ))}
        </CollapsibleSection>
      ) : null}
    </>
  )
}

export default PaymentInfo

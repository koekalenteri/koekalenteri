import type { SectionProps } from './types'

import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'
import { useRecoilValue } from 'recoil'

import CollapsibleSection from '../../../components/CollapsibleSection'
import { eventMemerPricesSelector, eventPricesSelector } from '../../../recoil'

import EventPrice from './components/EventPrice'

export default function PaymentSection({
  disabled,
  errorStates,
  event,
  fields,
  onChange,
  open,
  onOpenChange,
}: Readonly<SectionProps>) {
  const { t } = useTranslation()
  const priceOptions = useRecoilValue(eventPricesSelector)
  const memberPriceOptions = useRecoilValue(eventMemerPricesSelector)
  const error = errorStates?.cost ?? errorStates?.costMember
  const helperText = error ? t('validation.event.errors') : ''

  return (
    <CollapsibleSection
      title={t('paymentDetails')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid2 container spacing={1}>
        <Grid2 container spacing={1}>
          <Grid2 sx={{ width: 200 }}>
            <EventPrice
              id="cost"
              disabled={disabled}
              options={priceOptions}
              event={event}
              fields={fields}
              onChange={onChange}
            />
          </Grid2>
          <Grid2 sx={{ width: 200 }}>
            <EventPrice
              id="costMember"
              disabled={disabled}
              options={memberPriceOptions}
              event={event}
              fields={fields}
              onChange={onChange}
            />
          </Grid2>
        </Grid2>
      </Grid2>
    </CollapsibleSection>
  )
}

import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'

import CollapsibleSection from '../../../components/CollapsibleSection'
import { SectionProps } from '../EventForm'

import EventPrice from './components/EventPrice'
import EventProperty from './components/EventProperty'

export default function PaymentSection({ errorStates, event, fields, onChange, open, onOpenChange }: SectionProps) {
  const { t } = useTranslation()
  const error =
    errorStates?.cost ?? errorStates?.costMember ?? errorStates?.accountNumber ?? errorStates?.referenceNumber
  const helperText = error ? t('validation.event.errors') : ''

  return (
    <CollapsibleSection
      title={t('event.paymentDetails')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 200 }}>
            <EventPrice id="cost" options={[30, 35, 40, 45]} event={event} fields={fields} onChange={onChange} />
          </Grid>
          <Grid item sx={{ width: 200 }}>
            <EventPrice id="costMember" options={[30, 35, 40, 45]} event={event} fields={fields} onChange={onChange} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <EventProperty id="accountNumber" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <EventProperty
              id="referenceNumber"
              event={event}
              fields={fields}
              options={[]}
              freeSolo
              onChange={onChange}
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}

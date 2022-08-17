import { Grid, InputAdornment } from "@mui/material";
import { Event } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";
import { PartialEvent } from ".";
import { CollapsibleSection } from "../..";
import { FieldRequirements } from "./validation";
import { EventProperty, EventPropertyProps } from "./EventProperty";

type PaymentSectionProps = {
  errorStates: { [Property in keyof Event]?: boolean }
  event: PartialEvent
  fields: FieldRequirements
  onChange: (props: Partial<Event>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function PaymentSection({ errorStates, event, fields, onChange, open, onOpenChange }: PaymentSectionProps) {
  const { t } = useTranslation();
  const error = errorStates.cost || errorStates.costMember || errorStates.accountNumber || errorStates.referenceNumber;
  const helperText = error ? t('validation.event.errors') : '';

  return (
    <CollapsibleSection title={t('event.paymentDetails')} open={open} onOpenChange={onOpenChange} error={error} helperText={helperText}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 200}}>
            <EventPrice id="cost" event={event} fields={fields} onChange={onChange} />
          </Grid>
          <Grid item sx={{width: 200}}>
            <EventPrice id="costMember" event={event} fields={fields} onChange={onChange} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <EventProperty id="accountNumber" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
          <Grid item sx={{width: 300}}>
            <EventProperty id="referenceNumber" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

type ValidatedPriceInputProps = Omit<EventPropertyProps<'cost'|'costMember', true>, 'options'>;

function EventPrice(props: ValidatedPriceInputProps) {
  return (
    <EventProperty
      {...props}
      freeSolo
      options={[30, 35, 40, 45]}
      getOptionLabel={(v) => v?.toString() || ''}
      endAdornment={<InputAdornment position="end" >€</InputAdornment>}
      onChange={(newProps) => props.onChange({[props.id]: +(newProps[props.id] || '')})}
    />
  );
}

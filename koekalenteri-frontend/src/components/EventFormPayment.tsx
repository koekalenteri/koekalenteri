import { Grid, InputAdornment } from "@mui/material";
import { Event } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";
import { CollapsibleSection, PartialEvent, ValidatedAutocomplete, ValidatedAutocompleteProps } from ".";
import { FieldRequirements } from "./EventForm.validation";

export function EventFormPayment({ event, fields, onChange }: { event: PartialEvent; fields: FieldRequirements; onChange: (props: Partial<Event>) => void; }) {
  const { t } = useTranslation('event');

  return (
    <CollapsibleSection title={t('paymentDetails')}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 200}}>
            <ValidatedPriceInput id="cost" event={event} fields={fields} onChange={onChange} />
          </Grid>
          <Grid item sx={{width: 200}}>
            <ValidatedPriceInput id="costMember" event={event} fields={fields} onChange={onChange} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <ValidatedAutocomplete id="accountNumber" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
          <Grid item sx={{width: 300}}>
            <ValidatedAutocomplete id="referenceNumber" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

type ValidatedPriceInputProps = Omit<ValidatedAutocompleteProps<'cost'|'costMember', true>, 'options'>;

function ValidatedPriceInput(props: ValidatedPriceInputProps) {
  return (
    <ValidatedAutocomplete
      {...props}
      freeSolo
      options={[30, 35, 40, 45]}
      getOptionLabel={(v) => v?.toString() || ''}
      endAdornment={< InputAdornment position="end" >€</InputAdornment>}
      onChange={(newProps) => props.onChange({[props.id]: +(newProps[props.id] || '')})}
    />
  );
}

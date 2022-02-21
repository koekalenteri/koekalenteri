import { Grid, Autocomplete, TextField, AutocompleteProps, InputAdornment } from "@mui/material";
import { Event } from "koekalenteri-shared/model";
import { useTranslation } from "react-i18next";
import { CollapsibleSection, PartialEvent } from ".";

export function EventFormPayment({ event, onChange }: { event: PartialEvent; onChange: (props: Partial<Event>) => void; }) {
  const { t } = useTranslation('event');

  return (
    <CollapsibleSection title={t('paymentDetails')}>
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 200}}>
            <PriceInput label={t('cost')} value={event.cost || ''} onChange={(e, value) => onChange({ cost: +value })} fullWidth />
          </Grid>
          <Grid item sx={{width: 200}}>
            <PriceInput label={t('costMember')} value={event.costMember || ''} onChange={(e, value) => onChange({ costMember: +value })} fullWidth />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{width: 300}}>
            <TextField label={t('accountNumber')} value={event.accountNumber || ''} onChange={e => onChange({ accountNumber: e.target.value })} fullWidth />
          </Grid>
          <Grid item sx={{width: 300}}>
            <TextField label={t('referenceNumber')} value={event.referenceNumber || ''} onChange={e => onChange({ referenceNumber: e.target.value })} fullWidth />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

function PriceInput(props: Partial<AutocompleteProps<number, false, true, true>> & {label: string}) {
  return (
    <Autocomplete
      {...props}
      freeSolo
      options={[30, 35, 40, 45]}
      getOptionLabel={(v) => v.toString()}
      renderInput={(params) => <TextField
        {...params}
        label={props.label}
        InputProps={{
          endAdornment: < InputAdornment position="end" >€</InputAdornment>
        }}
      />}
    />
  );
}

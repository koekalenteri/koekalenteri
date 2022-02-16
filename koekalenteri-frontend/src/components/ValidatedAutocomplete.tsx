import { Autocomplete, AutocompleteProps, TextField } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { PartialEvent } from '.';
import { FieldRequirements } from './validation';

export type ValidatedAutocompleteProps<Property extends keyof PartialEvent, freeSolo extends boolean> =
  Omit<AutocompleteProps<PartialEvent[Property], false, false, freeSolo>, 'renderInput' | 'onChange' | 'value'> & {
    id: Property,
    event: PartialEvent,
    fields: FieldRequirements,
    onChange: (props: Partial<Event>) => void
  };

export function ValidatedAutocomplete<Property extends keyof PartialEvent, freeSolo extends boolean>(props: ValidatedAutocompleteProps<Property, freeSolo>) {
  const { t } = useTranslation('event');
  const { t: ts } = useTranslation('states');
  const { id, event, fields: { state, required } } = props;
  const isRequired = required[id] || false;
  const error = isRequired && !event[id];
  const helperText = error ? t(id) + ' on vaadittu tieto "' + ts(state[id] || 'draft') + '" tilalla olevalle tapahtumalle' : '';
  return (
    <Autocomplete
      {...props}
      value={event[id]}
      renderInput={(params) => <TextField {...params} label={t(id)} required={isRequired} error={error} helperText={helperText} />}
      onChange={(e, value) => props.onChange({ [id]: value || undefined })}
      onInputChange={(e, value) => { props.freeSolo && value !== event[id] && props.onChange({ [id]: value }); }} />
  );
}

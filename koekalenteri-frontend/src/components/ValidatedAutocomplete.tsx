import { HelpOutlined } from '@mui/icons-material';
import { Autocomplete, AutocompleteProps, IconButton, TextField } from '@mui/material';
import { Box } from '@mui/system';
import { Event } from 'koekalenteri-shared/model';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PartialEvent } from '.';
import { FieldRequirements, validateEventField } from './validation';

export type ValidatedAutocompleteProps<Property extends keyof PartialEvent, freeSolo extends boolean> =
  Omit<AutocompleteProps<PartialEvent[Property], false, false, freeSolo>, 'renderInput' | 'onChange' | 'value'> & {
    id: Property,
    event: PartialEvent,
    fields: FieldRequirements,
    onChange: (props: Partial<Event>) => void,
    helpClick?: React.MouseEventHandler<HTMLButtonElement>
    endAdornment?: ReactNode
  };

export function ValidatedAutocomplete<Property extends keyof PartialEvent, freeSolo extends boolean>(props: ValidatedAutocompleteProps<Property, freeSolo>) {
  const { t } = useTranslation('event');
  const { t: ts } = useTranslation('states');
  const { id, event, fields: { state, required }, helpClick, endAdornment, ...acProps } = props;
  const isRequired = required[id] || false;
  const validationError = isRequired && validateEventField(event, id);
  const error = !!validationError;
  const helperText = error ? t(id) + ' '  + (validationError || ('on vaadittu tieto "' + ts(state[id] || 'draft') + '" -tilassa olevalle tapahtumalle')) : '';
  return (
    <Autocomplete
      id={id}
      {...acProps}
      value={event[id]}
      renderInput={(params) =>
        <Box sx={{display: 'flex', flex: '0 0 auto', position: 'relative'}}>
          <TextField
            {...params}
            label={t(id)}
            required={isRequired}
            error={error}
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              endAdornment: <>{endAdornment}{params.InputProps.endAdornment}</>
            }}
          />
          <IconButton onClick={helpClick} sx={{display: helpClick ? 'block' : 'none', position: 'absolute', right: 0, top: 8}}>
            <HelpOutlined />
          </IconButton>
        </Box>
      }
      onChange={(e, value) => props.onChange({ [id]: value || undefined })}
      onInputChange={(e, value) => { props.freeSolo && value !== event[id] && props.onChange({ [id]: value }); }}
    />
  );
}

import { ReactNode, SyntheticEvent, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpOutlined } from '@mui/icons-material'
import { Autocomplete, AutocompleteFreeSoloValueMapping, AutocompleteProps, IconButton, TextField } from '@mui/material'
import { Box } from '@mui/system'
import { Event } from 'koekalenteri-shared/model'

import { PartialEvent } from '../../EventForm'
import { FieldRequirements, validateEventField } from '../validation'

export type EventPropertyProps<Property extends keyof PartialEvent, freeSolo extends boolean> =
  Omit<AutocompleteProps<PartialEvent[Property], false, false, freeSolo>, 'renderInput' | 'onChange' | 'value'> & {
    id: Property,
    event: PartialEvent,
    fields?: FieldRequirements,
    onChange: (props: Partial<Event>) => void,
    helpClick?: React.MouseEventHandler<HTMLButtonElement>
    endAdornment?: ReactNode
  };

export default function EventProperty<Property extends keyof PartialEvent, freeSolo extends boolean>(props: EventPropertyProps<Property, freeSolo>) {
  const { t } = useTranslation()
  const { id, event, fields, helpClick, endAdornment, onChange, ...acProps } = props
  const isRequired = fields?.required[id] || false
  const error = isRequired && validateEventField(event, id, true)
  const helperText = error ? t(`validation.event.${error.key}`, error.opts) : ''

  const handleChange = useCallback((
    e: SyntheticEvent<Element, globalThis.Event>,
    value: PartialEvent[Property] | AutocompleteFreeSoloValueMapping<freeSolo> | null,
  ) => onChange({ [id]: value ?? undefined }), [id, onChange])

  const handleInputChange = useCallback((
    e: SyntheticEvent<Element, globalThis.Event>,
    value: string,
  ) => {
    if (!props.freeSolo) {
      return
    }
    const old = event[id]
    const type = typeof old
    if ((type === 'number' && old !== +(value ?? '')) || (type !== 'number' && old !== value)) {
      onChange({ [id]: value })
    }
  }, [event, id, onChange, props.freeSolo])

  return (
    <Autocomplete
      id={id}
      {...acProps}
      value={event[id]}
      renderInput={(params) =>
        <Box sx={{ display: 'flex', flex: '0 0 auto', position: 'relative' }}>
          <TextField
            {...params}
            label={t(`event.${id}`)}
            required={isRequired}
            error={!!error}
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              endAdornment: <>{endAdornment}{params.InputProps.endAdornment}</>,
            }}
          />
          <IconButton onClick={helpClick} sx={{ display: helpClick ? 'flex' : 'none', margin: 'auto' }}>
            <HelpOutlined />
          </IconButton>
        </Box>
      }
      onChange={handleChange}
      onInputChange={handleInputChange}
    />
  )
}

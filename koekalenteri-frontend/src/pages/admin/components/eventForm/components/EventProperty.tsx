import { ReactNode, SyntheticEvent, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import HelpOutlined from '@mui/icons-material/HelpOutlined'
import { AutocompleteFreeSoloValueMapping, AutocompleteProps } from '@mui/material'
import Autocomplete, { AutocompleteInputChangeReason, AutocompleteRenderInputParams } from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { Box } from '@mui/system'
import { Event } from 'koekalenteri-shared/model'

import useDebouncedCallback from '../../../../../hooks/useDebouncedCallback'
import { PartialEvent } from '../../EventForm'
import { FieldRequirements, validateEventField } from '../validation'

export type EventPropertyProps<Property extends keyof PartialEvent, freeSolo extends boolean> = Omit<
  AutocompleteProps<PartialEvent[Property], false, false, freeSolo>,
  'renderInput' | 'onChange' | 'value'
> & {
  id: Property
  event: PartialEvent
  fields?: FieldRequirements
  onChange?: (props: Partial<Event>) => void
  helpClick?: React.MouseEventHandler<HTMLButtonElement>
  endAdornment?: ReactNode
}

const getInputInitValue = <Property extends keyof PartialEvent, freeSolo extends boolean>(
  prop: string | PartialEvent[Property] | null,
  props: EventPropertyProps<Property, freeSolo>
) => {
  if (prop === null) {
    return ''
  }
  if (typeof prop === 'string') {
    return prop
  }
  if (props.getOptionLabel) {
    return props.getOptionLabel(prop)
  }
  if (typeof prop === 'number') {
    return `${prop}`
  }
  return ''
}

const EventProperty = <Property extends keyof PartialEvent, freeSolo extends boolean>(
  props: EventPropertyProps<Property, freeSolo>
) => {
  const { t } = useTranslation()
  const { id, event, fields, helpClick, endAdornment, onChange, ...acProps } = props
  const value = event[id]
  const fixedValue = value ?? null
  const [inputValue, setInputValue] = useState(getInputInitValue(fixedValue, props))
  const isRequired = fields?.required[id] ?? false
  const error = isRequired && validateEventField(event, id, true)
  const helperText = error ? t(`validation.event.${error.key}`, error.opts) : ''

  const handleChange = useCallback(
    (
      e: SyntheticEvent<Element, globalThis.Event>,
      value: PartialEvent[Property] | AutocompleteFreeSoloValueMapping<freeSolo> | null
    ) => {
      if (!acProps.options.length) {
        return
      }
      const valueOrUndef = value ?? undefined
      onChange?.({ [id]: valueOrUndef })
    },
    [acProps.options.length, id, onChange]
  )

  const debouncedonChange = useDebouncedCallback((value) => {
    if (!props.freeSolo) {
      return
    }
    onChange?.({ [id]: value === '' ? undefined : value })
  })

  const handleInputChange = useCallback(
    (e: SyntheticEvent<Element, globalThis.Event>, value: string, reason: AutocompleteInputChangeReason) => {
      if (reason === 'reset' && value === '') return
      setInputValue(value)
      debouncedonChange(value)
    },
    [debouncedonChange]
  )

  const renderInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <Box sx={{ display: 'flex', flex: '0 0 auto', position: 'relative' }}>
        <TextField
          {...params}
          label={t(`event.${id}`)}
          required={isRequired}
          error={!!error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {endAdornment}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
        <IconButton onClick={helpClick} sx={{ display: helpClick ? 'flex' : 'none', margin: 'auto' }}>
          <HelpOutlined />
        </IconButton>
      </Box>
    ),
    [endAdornment, error, helpClick, helperText, id, isRequired, t]
  )

  return (
    <Autocomplete
      id={id}
      {...acProps}
      value={fixedValue}
      inputValue={inputValue}
      renderInput={renderInput}
      onChange={handleChange}
      onInputChange={handleInputChange}
    />
  )
}

EventProperty.displayName = 'EventProperty'

export default EventProperty

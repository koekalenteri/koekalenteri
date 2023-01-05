import { InputAdornment } from "@mui/material"

import EventProperty, { EventPropertyProps } from "./EventProperty"

type ValidatedPriceInputProps = Omit<EventPropertyProps<'cost' | 'costMember', true>, 'options'>;
export default function EventPrice(props: ValidatedPriceInputProps) {
  return (
    <EventProperty
      {...props}
      freeSolo
      options={[30, 35, 40, 45]}
      getOptionLabel={(v) => v?.toString() || ''}
      endAdornment={<InputAdornment position="end">€</InputAdornment>}
      onChange={(newProps) => props.onChange({ [props.id]: +(newProps[props.id] || '') })} />
  )
}

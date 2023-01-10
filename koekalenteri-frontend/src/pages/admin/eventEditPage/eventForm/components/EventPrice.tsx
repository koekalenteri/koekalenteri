import { useCallback } from "react"
import { InputAdornment } from "@mui/material"
import { Event } from "koekalenteri-shared/model"

import EventProperty, { EventPropertyProps } from "./EventProperty"

type Props = Omit<EventPropertyProps<'cost' | 'costMember', true>, 'options'>

export default function EventPrice(props: Props) {
  const toString = useCallback((v?: string|number) => v?.toString() ?? '', [])
  const handleChange = useCallback((newProps: Partial<Event>) => props.onChange({ [props.id]: +(newProps[props.id] || '') }), [props])
  return (
    <EventProperty
      {...props}
      freeSolo
      options={[30, 35, 40, 45]}
      getOptionLabel={toString}
      endAdornment={<InputAdornment position="end">€</InputAdornment>}
      onChange={handleChange}
    />
  )
}

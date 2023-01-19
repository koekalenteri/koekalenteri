import { useCallback } from 'react'
import { InputAdornment } from '@mui/material'
import { Event } from 'koekalenteri-shared/model'

import EventProperty, { EventPropertyProps } from './EventProperty'

type Props = EventPropertyProps<'cost' | 'costMember', true>

export default function EventPrice(props: Props) {
  const toString = useCallback((v?: string|number) => v?.toString() ?? '', [])
  const handleChange = useCallback((newProps: Partial<Event>) => {
    const value = newProps[props.id]
    const numberOrUndef = value === null || value === undefined ? undefined : +value
    props.onChange?.({ [props.id]: numberOrUndef })
  }, [props])
  return (
    <EventProperty
      {...props}
      freeSolo
      getOptionLabel={toString}
      endAdornment={<InputAdornment position="end">€</InputAdornment>}
      onChange={handleChange}
    />
  )
}

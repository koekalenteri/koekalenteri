import type { Event } from 'koekalenteri-shared/model'
import type { EventPropertyProps } from './EventProperty'

import { useCallback } from 'react'
import InputAdornment from '@mui/material/InputAdornment'

import EventProperty from './EventProperty'

type Props = EventPropertyProps<'cost' | 'costMember', true>

const validate = (v: string) => v.replace(/\D/g, '')

const numberOrUndefined = (value?: string | number) => {
  const number = Number(value)
  if (value === null || isNaN(number)) return undefined
  return number
}

export default function EventPrice(props: Props) {
  const toString = useCallback((v?: string | number) => v?.toString() ?? '', [])
  const handleChange = useCallback(
    (newProps: Partial<Event>) => {
      props.onChange?.({ [props.id]: numberOrUndefined(newProps[props.id]) })
    },
    [props]
  )
  return (
    <EventProperty
      {...props}
      freeSolo
      getOptionLabel={toString}
      endAdornment={<InputAdornment position="end">€</InputAdornment>}
      onChange={handleChange}
      validateInput={validate}
    />
  )
}

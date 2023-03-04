import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { Grid, TextField } from '@mui/material'

import useDebouncedCallback from '../../../../hooks/useDebouncedCallback'

type TitlesAndNameProps = {
  className?: string
  disabledName?: boolean
  disabledTitles?: boolean
  id: string
  name?: string
  nameLabel: string
  onChange?: (props: { titles?: string; name?: string }) => void
  titles?: string
  titlesLabel: string
}
export function TitlesAndName({
  className,
  disabledName,
  disabledTitles,
  id,
  name,
  nameLabel,
  onChange,
  titles,
  titlesLabel,
}: TitlesAndNameProps) {
  const [localName, setLocalName] = useState('')
  const [localTitles, setLocalTitles] = useState('')

  const handleChange = useDebouncedCallback(onChange)

  const handleTitlesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toLocaleUpperCase()
      setLocalTitles(value)
      handleChange({ name: localName, titles: value })
    },
    [handleChange, localName]
  )

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toLocaleUpperCase()
      setLocalName(value)
      handleChange({ name: value, titles: localTitles })
    },
    [handleChange, localTitles]
  )

  useEffect(() => {
    setLocalName((name ?? '').toLocaleUpperCase())
    setLocalTitles((titles ?? '').toLocaleUpperCase())
  }, [name, titles])

  return (
    <Grid item container spacing={1}>
      <Grid item>
        <TextField
          className={className}
          disabled={disabledTitles}
          id={`${id}_titles`}
          label={titlesLabel}
          onChange={handleTitlesChange}
          sx={{ width: 300 }}
          value={localTitles}
        />
      </Grid>
      <Grid item>
        <TextField
          className={className}
          disabled={disabledName}
          error={!disabledName && !name}
          id={`${id}_name`}
          label={nameLabel}
          onChange={handleNameChange}
          sx={{ width: 450 }}
          value={localName}
        />
      </Grid>
    </Grid>
  )
}

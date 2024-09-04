import type { ChangeEvent } from 'react'

import { useCallback, useEffect, useState } from 'react'
import Grid2 from '@mui/material/Grid2'
import TextField from '@mui/material/TextField'

import useDebouncedCallback from '../../../../hooks/useDebouncedCallback'

interface Props {
  readonly className?: string
  readonly disabledName?: boolean
  readonly disabledTitles?: boolean
  readonly id: string
  readonly name?: string
  readonly nameLabel: string
  readonly onChange?: (props: { titles?: string; name?: string }) => void
  readonly titles?: string
  readonly titlesLabel: string
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
}: Props) {
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
    <Grid2 container spacing={1} size={{ xs: 12 }}>
      <Grid2 size={{ xs: 12, md: 6 }}>
        <TextField
          className={className}
          disabled={disabledTitles}
          fullWidth
          id={`${id}_titles`}
          label={titlesLabel}
          onChange={handleTitlesChange}
          value={localTitles}
        />
      </Grid2>
      <Grid2 size={{ xs: 12, md: 6 }}>
        <TextField
          className={className}
          disabled={disabledName}
          error={!disabledName && !name}
          fullWidth
          id={`${id}_name`}
          label={nameLabel}
          onChange={handleNameChange}
          value={localName}
        />
      </Grid2>
    </Grid2>
  )
}

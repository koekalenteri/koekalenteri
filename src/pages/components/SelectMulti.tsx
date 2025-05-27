import type { SelectChangeEvent } from '@mui/material/Select'

import { type MouseEvent, useState } from 'react'
import CancelIcon from '@mui/icons-material/Cancel'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
type Props = {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  label?: string
}

export default function SelectMulti({ options, value, onChange, label = 'Select options' }: Props) {
  const [open, setOpen] = useState(false)
  const handleChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value
    setOpen(false)
    onChange(Array.isArray(value) ? value : [value])
  }

  const handleDelete = (chipToDelete: string) => (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    onChange(value.filter((v) => v !== chipToDelete))
  }

  return (
    <FormControl fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        data-testid={label}
        multiple
        open={open}
        onOpen={() => setOpen(true)}
        value={value}
        onChange={handleChange}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {selected.map((val) => (
              <Chip
                size="small"
                key={val}
                label={val}
                deleteIcon={
                  <CancelIcon onMouseDown={(event) => event.stopPropagation()} onClick={(e) => e.stopPropagation()} />
                }
                onDelete={handleDelete(val)}
              />
            ))}
          </Box>
        )}
        MenuProps={{
          disablePortal: true,
        }}
      >
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            <Checkbox size="small" checked={value.includes(option)} />
            <ListItemText primary={option} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

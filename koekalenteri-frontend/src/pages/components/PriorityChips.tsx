import Chip from '@mui/material/Chip'

import { PRIORITY } from '../../lib/priority'

interface Props {
  priority: string[]
}

export const PriorityChips = ({ priority }: Props) => (
  <>
    {priority.map((value) => {
      const p = PRIORITY.find((p) => p.value === value)
      return p ? <Chip label={p.name} size="small" /> : null
    })}
  </>
)

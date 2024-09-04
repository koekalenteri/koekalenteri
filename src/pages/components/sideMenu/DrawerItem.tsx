import type { MouseEventHandler, ReactNode } from 'react'

import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  readonly text: string
  readonly icon: ReactNode
  readonly onClick?: MouseEventHandler
}

export default function DrawerItem({ text, icon, onClick }: Props) {
  return (
    <ListItemButton key={text} onClick={onClick}>
      <Tooltip title={text} arrow>
        <ListItemIcon aria-label={text}>{icon}</ListItemIcon>
      </Tooltip>
      <ListItemText primary={text} />
    </ListItemButton>
  )
}

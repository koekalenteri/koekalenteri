import type { MouseEventHandler, ReactNode } from 'react'

import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  text: string
  icon: ReactNode
  onClick?: MouseEventHandler
}

export default function DrawerItem({ text, icon, onClick }: Props) {
  return (
    <ListItem button key={text} onClick={onClick}>
      <Tooltip title={text} arrow>
        <ListItemIcon aria-label={text}>{icon}</ListItemIcon>
      </Tooltip>
      <ListItemText primary={text} />
    </ListItem>
  )
}

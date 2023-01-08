import { MouseEventHandler, ReactNode } from 'react'
import { ListItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material'


interface Props {
  text: string
  icon: ReactNode
  onClick?: MouseEventHandler
}

export default function DrawerItem({ text, icon, onClick }: Props) {
  return (
    <ListItem button key={text} onClick={onClick}>
      <Tooltip title={text} arrow><ListItemIcon aria-label={text}>{icon}</ListItemIcon></Tooltip>
      <ListItemText primary={text} />
    </ListItem>
  )
}

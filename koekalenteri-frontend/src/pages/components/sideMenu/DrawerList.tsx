import { ReactNode } from 'react'
import { List } from '@mui/material'


interface Props {
  children: ReactNode
}

export default function DrawerList({ children }: Props) {
  return (
    <List>
      {children}
    </List>
  )
}

import type { ReactNode } from 'react'
import List from '@mui/material/List'

interface Props {
  readonly children: ReactNode
}

export default function DrawerList({ children }: Props) {
  return <List>{children}</List>
}

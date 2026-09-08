import type { MouseEventHandler, ReactNode } from 'react'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import { useCallback, useState } from 'react'
import { NavLink } from 'react-router'

interface Props {
  readonly text: string
  readonly icon: ReactNode
  readonly onClick?: () => void | Promise<void>
  readonly to?: string
}

export default function DrawerItem({ text, icon, onClick, to }: Props) {
  const [loading, setLoading] = useState(false)
  const handleClick = useCallback<MouseEventHandler>(async () => {
    if (loading) return

    const result = onClick?.()
    if (!result) return

    setLoading(true)
    try {
      await result
    } finally {
      setLoading(false)
    }
  }, [loading, onClick])
  const content = (
    <>
      <Tooltip title={text} arrow>
        <ListItemIcon aria-label={text}>{icon}</ListItemIcon>
      </Tooltip>
      <ListItemText primary={text} />
    </>
  )

  // The button is the item, but a <ul> may only hold <li>: without this wrapper the links and the
  // logout button sit directly in the list, which is what axe reports as a broken list.
  return (
    <ListItem disablePadding>
      {to ? (
        <ListItemButton component={NavLink} disabled={loading} to={to} onClick={handleClick}>
          {content}
        </ListItemButton>
      ) : (
        <ListItemButton component="button" type="button" disabled={loading} onClick={handleClick}>
          {content}
        </ListItemButton>
      )}
    </ListItem>
  )
}

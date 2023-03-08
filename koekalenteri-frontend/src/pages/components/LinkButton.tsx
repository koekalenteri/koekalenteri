import { MouseEventHandler } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@mui/material'

interface Props {
  to: string
  text: string
  sx?: Record<string, any>
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

export default function LinkButton({ to, text, onClick, sx = {} }: Props) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.stopPropagation()
    onClick?.(e)
  }
  sx.padding = '0 8px !important'
  sx.fontWeight = 'bold'
  sx.textDecoration = 'underline'

  return (
    <Button size="small" sx={sx} component={Link} to={to} onClick={handleClick}>
      {text}
    </Button>
  )
}

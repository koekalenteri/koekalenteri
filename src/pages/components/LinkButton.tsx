import type { ComponentProps, MouseEventHandler } from 'react'
import Box from '@mui/material/Box'
import { Link, useNavigate } from 'react-router'

interface Props extends Readonly<Omit<ComponentProps<typeof Link>, 'className' | 'onClick'>> {
  readonly text: string
  readonly sx?: Record<string, any>
  readonly back?: boolean
}

export default function LinkButton({ to, text, sx, back, ...rest }: Props) {
  const navigate = useNavigate()
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.stopPropagation()
    if (back) {
      e.preventDefault()
      navigate(-1)
    }
  }

  return (
    <Box sx={{ px: 1, ...sx }} role="button">
      <Link className="link" to={to} onClick={handleClick} {...rest}>
        {text}
      </Link>
    </Box>
  )
}

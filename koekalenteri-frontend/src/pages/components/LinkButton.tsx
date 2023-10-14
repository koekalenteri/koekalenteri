import type { MouseEventHandler } from 'react'

import { Link, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'

interface Props {
  readonly to: string
  readonly text: string
  readonly sx?: Record<string, any>
  readonly back?: boolean
}

export default function LinkButton({ back, to, sx, text }: Props) {
  const navigate = useNavigate()
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.stopPropagation()
    if (back) {
      e.preventDefault()
      navigate(-1)
    }
  }

  return (
    <Box sx={{ px: 1, ...sx }}>
      <Link className="link" to={to} onClick={handleClick}>
        {text}
      </Link>
    </Box>
  )
}

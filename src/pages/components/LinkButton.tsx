import type { ComponentProps, MouseEventHandler } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { Link, useNavigate } from 'react-router'

interface Props extends Readonly<Omit<ComponentProps<typeof Link>, 'className' | 'onClick'>> {
  readonly text: string
  readonly sx?: Record<string, any>
  readonly back?: boolean
  readonly loading?: boolean
  readonly onClick?: MouseEventHandler<HTMLAnchorElement>
}

export default function LinkButton({ to, text, sx, back, loading = false, onClick, ...rest }: Props) {
  const navigate = useNavigate()
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.stopPropagation()
    if (loading) {
      e.preventDefault()
      return
    }
    onClick?.(e)
    if (back) {
      e.preventDefault()
      navigate(-1)
    }
  }

  return (
    <Box sx={{ px: 1, ...sx }} role="button">
      <Link
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        className="link"
        to={to}
        onClick={handleClick}
        {...rest}
      >
        {loading ? <CircularProgress aria-label="loading" size="1em" /> : text}
      </Link>
    </Box>
  )
}

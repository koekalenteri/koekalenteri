import type { ReactNode } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Button from '@mui/material/Button'
import { Link } from 'react-router'

interface Props {
  readonly to: string
  readonly children: ReactNode
}

/**
 * The way back out of a screen. One shape wherever a way back is offered, so the secretary looks
 * for it in the same place with the same words.
 */
export function BackLink({ to, children }: Props) {
  return (
    <Button component={Link} size="small" startIcon={<ArrowBack fontSize="small" />} sx={{ ml: -1 }} to={to}>
      {children}
    </Button>
  )
}

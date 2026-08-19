import type { ButtonProps } from '@mui/material'
import type { MouseEvent } from 'react'
import Button from '@mui/material/Button'
import { useCallback, useRef, useState } from 'react'

type ClickEvent = MouseEvent<HTMLButtonElement, globalThis.MouseEvent>

interface Props extends Omit<ButtonProps, 'onClick'> {
  onClick?: (event: ClickEvent) => Promise<void>
}

export const AsyncButton = (props: Props) => {
  const { disabled, onClick, ...rest } = props
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)

  const handleClick = useCallback(
    async (event: ClickEvent) => {
      if (pending.current || event.detail > 1) return
      pending.current = true
      setLoading(true)
      try {
        await onClick?.(event)
      } finally {
        pending.current = false
        setLoading(false)
      }
    },
    [onClick]
  )

  return <Button disabled={loading || disabled} onClick={handleClick} {...rest} />
}

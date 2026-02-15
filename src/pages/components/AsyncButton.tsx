import type { ButtonProps } from '@mui/material'
import type { MouseEvent } from 'react'
import Button from '@mui/material/Button'
import { useCallback, useState } from 'react'

type ClickEvent = MouseEvent<HTMLButtonElement, globalThis.MouseEvent>

interface Props extends Omit<ButtonProps, 'onClick'> {
  onClick?: (event: ClickEvent) => Promise<void>
}

export const AsyncButton = (props: Props) => {
  const { disabled, onClick, ...rest } = props
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(
    async (event: ClickEvent) => {
      if (loading) return
      setLoading(true)
      await onClick?.(event)
      setLoading(false)
    },
    [loading, onClick]
  )

  return <Button disabled={loading || disabled} onClick={handleClick} {...rest} />
}

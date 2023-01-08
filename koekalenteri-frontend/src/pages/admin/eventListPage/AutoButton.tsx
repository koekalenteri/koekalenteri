import { Button, ButtonProps, IconButton, Stack, Theme, Typography, useMediaQuery } from '@mui/material'

interface Props extends ButtonProps {
  text: string
}

export default function AutoButton(props: Props) {
  const sm = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const { children, text, ...rest } = props

  if (sm) {
    return (
      <Stack>
        <IconButton color="primary" {...rest}>{rest.startIcon || rest.endIcon}</IconButton>
        <Typography variant="caption" noWrap sx={{ textAlign: 'center', width: 56, overflow: 'hidden' }}>{text}</Typography>
      </Stack>
    )
  }
  return <Button color="primary" {...rest}>{text}</Button>
}

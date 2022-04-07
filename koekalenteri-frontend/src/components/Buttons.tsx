import { Box, Button, ButtonProps, IconButton, Stack, Theme, Typography, useMediaQuery } from '@mui/material';
import { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LinkButton({ to, text, sx = {} }: { to: string, text: string, sx?: Record<string, any> }) {
  sx.padding = '0 8px !important';
  return (
    <Button size="small" color="info" sx={sx} component={Link} to={to}>{text}</Button>
  );
}

type AppBarButtonProps = { startIcon?: ReactNode, endIcon?: ReactNode, onClick?: MouseEventHandler, children?: ReactNode };
export function AppBarButton(props: AppBarButtonProps) {
  return (
    <Button
      onClick={props.onClick}
      startIcon={props.startIcon}
      endIcon={props.endIcon}
      sx={{
        textTransform: 'none',
        '& .MuiButton-startIcon': { marginRight: {xs: 0, sm: 2}},
        '& .MuiButton-endIcon': { marginLeft: {xs: 0, sm: 2}}
      }}
    >
      <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{props.children}</Box>
    </Button>
  );
}

export function AutoButton(props: ButtonProps & { text: string }) {
  const sm = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const {children, text, ...rest} = props;

  if (sm) {
    return (
      <Stack>
        <IconButton color="primary" {...rest}>{rest.startIcon || rest.endIcon}</IconButton>
        <Typography variant="caption" noWrap sx={{ textAlign: 'center', width: 56, overflow: 'hidden' }}>{text}</Typography>
      </Stack >
    );
  }
  return <Button color="primary" {...rest}>{text}</Button>
}

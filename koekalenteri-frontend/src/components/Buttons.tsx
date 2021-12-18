import { Button } from '@mui/material';
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
      sx={{ textTransform: 'none' }}
    >
      {props.children}
    </Button>
  );
}

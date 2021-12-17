import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

export function LinkButton({ to, text, sx = {} }: { to: string, text: string, sx?: Record<string, any> }) {
  sx.padding = '0 8px !important';
  return (
    <Button size="small" color="info" sx={sx} component={Link} to={to}>{text}</Button>
  );
}

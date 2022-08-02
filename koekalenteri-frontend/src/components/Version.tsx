import { Box } from '@mui/material';
import { lightFormat } from 'date-fns';
import preval from 'preval.macro';
import pkg from '../../package.json';

const buildTimestamp = preval`module.exports = new Date().getTime();` as number;

export default function Version() {
  const date = lightFormat(buildTimestamp, 'dd.MM.yyyy');
  return <Box sx={{
    bottom: 0,
    color: 'secondary',
    fontSize: 10,
    p: 0.5,
    position: 'fixed',
    textAlign: 'right',
    width: '100%',
    zIndex: -1
  }}>v{pkg.version} ({date})</Box>
}

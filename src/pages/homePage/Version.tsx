import Box from '@mui/material/Box'
import { lightFormat } from 'date-fns'
import preval from 'preval.macro'

import pkg from '../../../package.json'
import { BANNER_HEIGHT } from '../components/Banner'

const buildTimestamp = preval`module.exports = new Date().getTime();` as number

export default function Version() {
  const date = lightFormat(buildTimestamp, 'dd.MM.yyyy HH:mm')
  return (
    <Box
      sx={{
        top: `calc(${BANNER_HEIGHT} -  14px)`,
        left: 0,
        color: '#eee',
        fontSize: 6,
        fontFamily: 'monospace',
        p: 0.5,
        position: 'absolute',
        textAlign: 'right',
        zIndex: 2,
        width: '100%',
        textShadow: '1px 1px 1px #222',
      }}
    >
      v{pkg.version} [{date}]
    </Box>
  )
}

import Box from '@mui/material/Box'
import { lightFormat } from 'date-fns'
import preval from 'preval.macro'

import pkg from '../../../package.json'
import { HEADER_HEIGHT } from '../../assets/Theme'

const buildTimestamp = preval`module.exports = new Date().getTime();` as number

export default function Version() {
  const date = lightFormat(buildTimestamp, 'dd.MM.yyyy')
  const time = lightFormat(buildTimestamp, 'HH:mm')
  return (
    <Box
      sx={{
        top: HEADER_HEIGHT,
        position: 'absolute',
        left: 0,
        right: 0,
        color: '#eee',
        fontSize: 8,
        fontFamily: 'monospace',
        p: 0.5,
        textAlign: 'right',
        zIndex: 2,
        textShadow: '1px 1px 1px #000',
      }}
      component="aside"
    >
      v{pkg.version}
      <br />
      <small>{date}</small>
      <br />
      <small>{time}</small>
    </Box>
  )
}

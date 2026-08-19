import Box from '@mui/material/Box'
import { lightFormat } from 'date-fns'
import pkg from '../../../package.json'
import { HEADER_HEIGHT } from '../../assets/Theme'

export default function Version() {
  const date = lightFormat(__BUILD_TIMESTAMP__, 'dd.MM.yyyy')
  const time = lightFormat(__BUILD_TIMESTAMP__, 'HH:mm')
  return (
    <Box
      sx={{
        color: '#eee',
        fontFamily: 'monospace',
        fontSize: 10,
        left: 0,
        p: 0.5,
        position: 'absolute',
        right: 0,
        textAlign: 'right',
        textShadow: '1px 1px 1px #000',
        top: HEADER_HEIGHT,
        zIndex: 2,
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

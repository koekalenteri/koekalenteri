import { Box } from '@mui/material'

const NoRowsOverlay = () => {
  return <Box className='no-rows' sx={{
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }}
  >
    Raahaa osallistujat tähän!
  </Box>
}

export default NoRowsOverlay

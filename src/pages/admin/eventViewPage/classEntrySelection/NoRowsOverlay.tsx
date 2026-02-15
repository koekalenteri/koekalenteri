import Box from '@mui/material/Box'

const NoRowsOverlay = () => {
  return (
    <Box
      className="no-rows"
      sx={{
        alignItems: 'center',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      Raahaa osallistujat tähän!
    </Box>
  )
}

export default NoRowsOverlay

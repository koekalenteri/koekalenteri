import { Box } from '@mui/material';

const NoRowsOverlay = () => {
  return <Box sx={{
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    bgcolor: 'background.selected'
  }}
  >
    Raahaa osallistujat tähän!
  </Box>;
};

export default NoRowsOverlay

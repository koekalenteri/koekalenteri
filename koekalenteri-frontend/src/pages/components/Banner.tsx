import { Box } from '@mui/material'

import banner from '../../assets/banner.jpg'

const Banner = () => {
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner})`,
        backgroundRepeat: 'round',
        backgroundSize: 'contain',
        backgroundOrigin: 'padding-box',
        backgroundPositionY: '36px',
        width: '100%',
        height: { xs: 72, sm: 108, md: 144 },
      }}
    ></Box>
  )
}

export default Banner

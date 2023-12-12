import Box from '@mui/material/Box'

import banner from '../../assets/banner.jpg'

const Banner = () => {
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundOrigin: 'padding-box',
        backgroundPositionY: { xs: 32, sm: 24, md: 16, lg: 8, xl: -16 },
        width: '100%',
        height: { xs: 128, sm: 192, md: 256, lg: 320 },
        maxHeight: '30vh',
      }}
    ></Box>
  )
}

export default Banner

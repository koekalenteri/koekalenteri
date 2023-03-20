import { Box } from '@mui/material'

import banner from '../../assets/banner.jpg'

const Banner = () => {
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundBlendMode: 'luminosity',
        backgroundColor: 'secondary.main',
        width: '100%',
        height: { xs: 72, sm: 108, md: 144 },
      }}
    ></Box>
  )
}

export default Banner

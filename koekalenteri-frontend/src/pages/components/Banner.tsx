import { Box } from '@mui/material'

import banner from '../../assets/banner.png'

const Banner = () => {
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner})`,
        backgroundRepeat: 'no-repeat',
        backgroundPositionY: '36px',
        backgroundSize: 'cover',
        width: '100%',
        height: { xs: 98, sm: 148, md: 260 },
      }}
    ></Box>
  )
}

export default Banner

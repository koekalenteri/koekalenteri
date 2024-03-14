import Box from '@mui/material/Box'

import banner from '../../assets/banner.webp'

export const BANNER_HEIGHT = 'min(25vh, 32vw)'

const Banner = () => {
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundOrigin: 'padding-box',
        backgroundPositionY: 'calc(46px - 3vw)',
        width: '100%',
        height: BANNER_HEIGHT,
      }}
    ></Box>
  )
}

export default Banner

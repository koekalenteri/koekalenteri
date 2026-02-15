import type { CSSProperties } from 'react'
import Box from '@mui/material/Box'
import { useCallback, useEffect, useState } from 'react'
import banner512 from '../../assets/banner_w512.webp'
import banner889 from '../../assets/banner_w889.webp'
import banner1504 from '../../assets/banner_w1504.webp'

export const BANNER_HEIGHT = 'min(25vh, 32vw)'

const Banner = () => {
  const [loading, setLoading] = useState<boolean | undefined>()
  // show the actual banner after its been loaded
  const onLoad = useCallback(() => setLoading(false), [])

  // start loading the actual banner after first render
  useEffect(() => {
    if (loading === undefined) {
      setLoading(true)
    }
  }, [loading])

  const commonImgStyles: CSSProperties = {
    height: BANNER_HEIGHT,
    objectFit: 'contain',
    objectPosition: '50% 30px',
    width: '100%',
  }

  return (
    <Box
      component="header"
      sx={{
        backgroundColor: '#a0a690',
        height: BANNER_HEIGHT,
        position: 'relative',
        width: '100%',
      }}
    >
      {loading !== undefined && (
        <img
          alt="banner"
          src={banner1504}
          srcSet={`${banner512} 512w, ${banner889} 900w, ${banner1504} 1504w`}
          style={{
            ...commonImgStyles,
            backgroundColor: '#a0a690',
            left: 0,
            opacity: loading ? 0 : 1,
            position: 'absolute',
            top: 0,
            transition: 'opacity 0.3s ease-in',
          }}
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
        />
      )}
    </Box>
  )
}

/*
const Banner = () => <img src={`url(${banner300})}`} />
  return (
    <Box
      sx={{
        backgroundImage: `url(${banner300}) image-set(url(${banner300}) 300w, url(${banner765}) 765w)`,
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
*/
export default Banner

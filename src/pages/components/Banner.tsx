import type { CSSProperties } from 'react'

import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'

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
    width: '100%',
    height: BANNER_HEIGHT,
    objectFit: 'contain',
    objectPosition: '50% 30px',
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: BANNER_HEIGHT,
        backgroundColor: '#a0a690',
      }}
    >
      {loading !== undefined && (
        <img
          src={banner1504}
          srcSet={`${banner512} 512w, ${banner889} 900w, ${banner1504} 1504w`}
          style={{
            ...commonImgStyles,
            opacity: loading ? 0 : 1,
            position: 'absolute',
            top: 0,
            left: 0,
            transition: 'opacity 0.3s ease-in',
            backgroundColor: '#a0a690',
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

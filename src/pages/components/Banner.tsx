import type { CSSProperties } from 'react'

import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'

import banner512 from '../../assets/banner_w512.webp'
import banner889 from '../../assets/banner_w889.webp'
import banner1504 from '../../assets/banner_w1504.webp'

export const BANNER_HEIGHT = 'min(25vh, 32vw)'

const placeholderDataUrl =
  'data:image/webp;base64,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'

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
      <img src={placeholderDataUrl} style={commonImgStyles} loading="lazy" decoding="async" />
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
            transition: 'opacity 0.3s ease-out',
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

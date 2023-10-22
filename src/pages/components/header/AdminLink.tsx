import { useTranslation } from 'react-i18next'
import { Link as SpaLink } from 'react-router-dom'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'

import { Path } from '../../../routeConfig'

interface Props {
  readonly active?: boolean
  readonly activeBorder?: string
}

export const AdminLink = ({ active, activeBorder }: Props) => {
  const { t } = useTranslation()
  const border = active ? activeBorder : undefined

  return (
    <Link
      to={Path.admin.index}
      component={SpaLink}
      sx={{
        textDecoration: 'none',
        borderBottom: border,
        mr: 1,
        px: 1,
      }}
    >
      <Typography
        variant="subtitle1"
        noWrap
        component="div"
        sx={{
          flexShrink: 1,
        }}
      >
        {t('admin')}
      </Typography>
    </Link>
  )
}

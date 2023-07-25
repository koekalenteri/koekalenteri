import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'
import Clear from '@mui/icons-material/Clear'
import Search from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { GridToolbarColumnsButton, GridToolbarContainer } from '@mui/x-data-grid'

export interface QuickSearchToolbarProps {
  clearSearch: () => void
  onChange: () => void
  value: string
  columnSelector?: boolean
  children?: ReactNode
}

export function QuickSearchToolbar(props: QuickSearchToolbarProps) {
  const { t } = useTranslation()

  return (
    <Stack sx={{ p: 0.5, pb: 0 }} direction="row" justifyContent="space-between" spacing={1} alignItems="center">
      {props.columnSelector ? <GridToolbarColumnsButton /> : null}
      <GridToolbarContainer sx={{ p: 0 }}>
        <>
          <TextField
            variant="standard"
            value={props.value}
            onChange={props.onChange}
            placeholder={t('searchPlaceholder')}
            InputProps={{
              startAdornment: <Search fontSize="small" />,
              endAdornment: (
                <IconButton
                  title={t('clear')}
                  aria-label={t('clear')}
                  size="small"
                  style={{ visibility: props.value ? 'visible' : 'hidden' }}
                  onClick={props.clearSearch}
                >
                  <Clear fontSize="small" />
                </IconButton>
              ),
            }}
            sx={{
              width: {
                xs: 1,
                sm: 'auto',
              },
              m: (theme) => theme.spacing(1, 0.5, 1.5),
              '& .MuiSvgIcon-root': {
                mr: 0.5,
              },
              '& .MuiInput-underline:before': {
                borderBottom: 1,
                borderColor: 'divider',
              },
            }}
          />
        </>
      </GridToolbarContainer>
      <GridToolbarContainer sx={{ p: 0, width: '50vw' }}>{props.children}</GridToolbarContainer>
    </Stack>
  )
}

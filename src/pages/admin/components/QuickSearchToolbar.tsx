import type { ReactNode } from 'react'
import Clear from '@mui/icons-material/Clear'
import Search from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { GridToolbarColumnsButton, GridToolbarContainer } from '@mui/x-data-grid'
import { useTranslation } from 'react-i18next'

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    columnSelector?: boolean
  }
}

interface QuickSearchToolbarProps {
  readonly clearSearch: () => void
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  readonly value: string
  readonly columnSelector?: boolean
  readonly children?: ReactNode
}

export function QuickSearchToolbar(props: QuickSearchToolbarProps) {
  const { t } = useTranslation()

  return (
    // On a phone the page's own filters take a row of their own under the search, instead of the three
    // sharing one that fits none of them.
    <Stack
      sx={{ columnGap: 1, flexWrap: 'wrap', p: 0.5, pb: 0, rowGap: 0.5 }}
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      useFlexGap
    >
      {props.columnSelector ? <GridToolbarColumnsButton /> : null}
      <GridToolbarContainer sx={{ flex: { sm: 'none', xs: 1 }, p: 0 }}>
        <TextField
          variant="standard"
          value={props.value}
          onChange={props.onChange}
          placeholder={t('search.placeholder')}
          sx={{
            '& .MuiInput-underline:before': {
              borderBottom: 1,
              borderColor: 'divider',
            },
            '& .MuiSvgIcon-root': {
              mr: 0.5,
            },
            m: (theme) => theme.spacing(1, 0.5, 1.5),
            width: {
              sm: 'auto',
              xs: 1,
            },
          }}
          slotProps={{
            input: {
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
              startAdornment: <Search fontSize="small" />,
            },
          }}
        />
      </GridToolbarContainer>
      <GridToolbarContainer sx={{ p: 0, width: { sm: '50vw', xs: '100%' } }}>{props.children}</GridToolbarContainer>
    </Stack>
  )
}

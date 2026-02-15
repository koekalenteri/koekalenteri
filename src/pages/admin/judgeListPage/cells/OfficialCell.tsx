import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { Judge } from '../../../../types'
import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'

const sx = { height: '27px' }
const OfficialCell = (props: GridRenderCellParams<Judge, boolean>) => {
  return props.value ? (
    <CheckBoxOutlined fontSize="small" sx={sx} />
  ) : (
    <CheckBoxOutlineBlankOutlined fontSize="small" sx={sx} />
  )
}

export default OfficialCell

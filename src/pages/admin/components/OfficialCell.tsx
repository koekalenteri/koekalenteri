import type { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid'
import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'

const sx = { height: '27px' }

const OfficialCell = <Row extends GridValidRowModel>(props: GridRenderCellParams<Row, boolean>) => {
  return props.value ? (
    <CheckBoxOutlined fontSize="small" sx={sx} />
  ) : (
    <CheckBoxOutlineBlankOutlined fontSize="small" sx={sx} />
  )
}

export default OfficialCell

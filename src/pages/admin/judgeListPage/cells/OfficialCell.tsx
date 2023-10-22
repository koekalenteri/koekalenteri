import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { Judge } from '../../../../types'

import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'

const OfficialCell = (props: GridRenderCellParams<Judge, boolean>) => {
  return props.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />
}

export default OfficialCell

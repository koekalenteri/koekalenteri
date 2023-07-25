import type { GridRenderCellParams } from '@mui/x-data-grid'
import type { EventType } from 'koekalenteri-shared/model'

import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'

const OfficialCell = (props: GridRenderCellParams<EventType, boolean>) => {
  return props.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />
}

export default OfficialCell

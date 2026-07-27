import { utils, writeFileXLSX } from 'xlsx'

export type SpreadsheetCell = Date | number | string | null | undefined

interface DownloadXlsxOptions {
  columnWidths?: number[]
  fileName: string
  rows: SpreadsheetCell[][]
  sheetName: string
}

export function downloadXlsx({ columnWidths, fileName, rows, sheetName }: DownloadXlsxOptions): void {
  const worksheet = utils.aoa_to_sheet(rows, { cellDates: true })
  for (const cell of Object.values(worksheet)) {
    if (typeof cell === 'object' && cell?.t === 'd') cell.z = 'yyyy-mm-dd'
  }
  if (columnWidths) worksheet['!cols'] = columnWidths.map((wch) => ({ wch }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, sheetName)
  writeFileXLSX(workbook, fileName, { compression: true })
}

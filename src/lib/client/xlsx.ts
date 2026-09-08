type SpreadsheetCell = Date | number | string | null | undefined

interface DownloadXlsxOptions {
  columnWidths?: number[]
  fileName: string
  rows: SpreadsheetCell[][]
  sheetName: string
}

/**
 * Loads the spreadsheet writer on demand. A static import put all 995 kB of xlsx into the initial
 * chunk of the public calendar, for two download buttons that most visitors never press.
 */
export async function downloadXlsx({ columnWidths, fileName, rows, sheetName }: DownloadXlsxOptions): Promise<void> {
  const { utils, writeFileXLSX } = await import(/* webpackChunkName: "xlsx" */ 'xlsx')

  const worksheet = utils.aoa_to_sheet(rows, { cellDates: true })
  for (const cell of Object.values(worksheet)) {
    if (typeof cell === 'object' && cell?.t === 'd') cell.z = 'yyyy-mm-dd'
  }
  if (columnWidths) worksheet['!cols'] = columnWidths.map((wch) => ({ wch }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, sheetName)
  writeFileXLSX(workbook, fileName, { compression: true })
}

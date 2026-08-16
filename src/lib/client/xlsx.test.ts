import type { WorkSheet } from 'xlsx'
import { utils, writeFileXLSX } from 'xlsx'
import { downloadXlsx } from './xlsx'

jest.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: jest.fn(),
    book_append_sheet: jest.fn(),
    book_new: jest.fn(),
  },
  writeFileXLSX: jest.fn(),
}))

describe('downloadXlsx', () => {
  const mockAoaToSheet = jest.mocked(utils.aoa_to_sheet)
  const mockBookAppendSheet = jest.mocked(utils.book_append_sheet)
  const mockBookNew = jest.mocked(utils.book_new)
  const mockWriteFileXLSX = jest.mocked(writeFileXLSX)

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('creates a workbook with formatted date cells and column widths', () => {
    const workbook = {} as ReturnType<typeof utils.book_new>
    const worksheet = { A1: { t: 's', v: 'Date' }, A2: { t: 'd', v: new Date('2023-02-01') } } as WorkSheet
    mockAoaToSheet.mockReturnValue(worksheet)
    mockBookNew.mockReturnValue(workbook)

    downloadXlsx({
      columnWidths: [12, 24],
      fileName: 'starttilista.xlsx',
      rows: [['Date'], [new Date('2023-02-01')]],
      sheetName: 'Starttilista',
    })

    expect(mockAoaToSheet).toHaveBeenCalledWith([['Date'], [new Date('2023-02-01')]], { cellDates: true })
    expect(worksheet.A2.z).toBe('yyyy-mm-dd')
    expect(worksheet['!cols']).toEqual([{ wch: 12 }, { wch: 24 }])
    expect(mockBookAppendSheet).toHaveBeenCalledWith(workbook, worksheet, 'Starttilista')
    expect(mockWriteFileXLSX).toHaveBeenCalledWith(workbook, 'starttilista.xlsx', { compression: true })
  })
})

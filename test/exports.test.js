import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {makeReport} from '../src/exports.js'

test('report exports include financial totals and the selected rows',async()=>{
  const columns=[['Client',row=>row.name],['Amount',row=>row.amount]]
  const rows=[{name:'Studio Client',amount:500}]
  const totals={value:50000,revenue:50000,pending:0,cost:0,estimated:50000,cash:50000}
  const pdf=await makeReport('pdf','Studio Report',columns,rows,totals)
  const pdfText=Buffer.from(pdf.bytes).toString('latin1')
  assert.ok(pdfText.startsWith('%PDF-'))
  assert.match(pdfText,/Studio Client/)
  const sheet=await makeReport('xlsx','Studio Report',columns,rows,totals)
  const book=new ExcelJS.Workbook()
  await book.xlsx.load(sheet.bytes)
  assert.equal(book.getWorksheet('Records').getCell('A2').value,'Studio Client')
  assert.equal(book.getWorksheet('Summary').getCell('A2').value,'Booking value')
})

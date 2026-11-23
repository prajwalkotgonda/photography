import {currency} from './model.js'

export async function makeReport(type,title,columns,rows,stats) {
  const header=columns.map(([label])=>label)
  const details=rows.map(row=>columns.map(([,cell])=>String(cell(row))))
  const summary=[['Booking value',currency(stats.value)],['Collected revenue',currency(stats.revenue)],['Pending',currency(stats.pending)],['Expenses',currency(stats.cost)],['Estimated net profit',currency(stats.estimated)],['Cash profit',currency(stats.cash)]]
  if(type==='pdf') {
    const {jsPDF}=await import('jspdf')
    const pdf=new jsPDF({orientation:'landscape'})
    const lines=[title,'',...summary.map(row=>row.join('  ')),'',header.join('  |  '),...details.map(row=>row.join('  |  '))]
    let y=16
    pdf.setFontSize(10)
    for (const line of lines) {
      for (const part of pdf.splitTextToSize(line.replaceAll('₹','INR '),265)) {
        if(y>193) {pdf.addPage();y=16}
        pdf.text(part,15,y)
        y+=5
      }
    }
    return {bytes:pdf.output('arraybuffer'),mime:'application/pdf',extension:'pdf'}
  } else {
    const {default:ExcelJS}=await import('exceljs')
    const book=new ExcelJS.Workbook()
    const overview=book.addWorksheet('Summary')
    overview.addRow([title])
    overview.addRows(summary)
    const sheet=book.addWorksheet('Records')
    sheet.addRow(header)
    sheet.addRows(details)
    for(const tab of [overview,sheet]) {
      tab.getRow(1).font={bold:true,color:{argb:'FF176B52'}}
      tab.columns.forEach(column=>{column.width=26})
    }
    return {bytes:await book.xlsx.writeBuffer(),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',extension:'xlsx'}
  }
}

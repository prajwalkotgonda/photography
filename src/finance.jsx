import {useState} from 'react'
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,Legend} from 'recharts'
import {Download,Plus,Wallet,Receipt,TrendingUp,Hourglass} from 'lucide-react'
import toast from 'react-hot-toast'
import {expenseCategories,remaining} from '../functions/domain.js'
import {useData} from './data'
import {bookings,currency,dateLabel,financials,presets,sourceLabel} from './model'
import {Badge,DateFilter,Heading,Panel,Select,Table} from './ui'

export const defaultRange={preset:'All Time',from:'',to:''}
export function Metrics({items}) {
  return <div className="metrics">{items.map(([label,value,Icon])=><section className="panel metric" key={label}><span className="metric-icon">{Icon&&<Icon size={19}/>}</span><div className="metric-label">{label}</div><strong>{value}</strong></section>)}</div>
}
export function FinanceChart({stats,mode='both'}) {
  const months={}
  for (const [list,key] of [[stats.payments,'Revenue'],[stats.expenses,'Expenses'],[stats.team,'Expenses']]) {
    for (const row of list) {
      const month=row.date.slice(0,7)
      months[month]??={month,Revenue:0,Expenses:0}
      months[month][key]+=row.amount/100
    }
  }
  const chart=Object.values(months).sort((a,b)=>a.month.localeCompare(b.month)).slice(-12).map(row=>({...row,month:new Date(row.month+'-15').toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}))
  if (!chart.length) return <div className="chart-empty"><span>No transactions in this date range.</span></div>
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{top:8,right:14,left:0,bottom:4}}><CartesianGrid vertical={false} stroke="#e7edeb" strokeDasharray="4 4"/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:12}}/><YAxis width={74} tickLine={false} axisLine={false} tick={{fontSize:12}} tickFormatter={v=>currency(v*100)}/><Tooltip formatter={v=>currency(Math.round(v*100))}/><Legend/>{mode!=='expenses'&&<Bar dataKey="Revenue" fill="#176b52" radius={[4,4,0,0]}/>}
  {mode!=='revenue'&&<Bar dataKey="Expenses" fill="#a4c8b7" radius={[4,4,0,0]}/>}</BarChart></ResponsiveContainer></div>
}
const reports=['Daily Business','Weekly','Monthly','Yearly','Wedding Revenue','Exposing Revenue','Expense','Team Payment','Pending Payment','Client Booking','Profit and Loss']
const bookingName=(data,row)=>bookings(data).find(item=>item.id===row.bookingId&&item.collection===row.source)?.name||'—'
const simpleBooking=[['Name',row=>row.name],['Date',row=>dateLabel(row.date)],['Source',row=>sourceLabel(row.collection)],['Booking value',row=>currency(row.amount)],['Status',row=>row.status]]
async function exportReport(type,title,columns,rows,stats) {
  const {makeReport}=await import('./exports.js')
  const {bytes,mime,extension}=await makeReport(type,title,columns,rows,stats)
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}))
  const link=document.createElement('a')
  link.href=url
  link.download=title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.'+extension
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),10000)
}
export function Finance({mode,openEditor}) {
  const data=useData()
  const reporting=mode==='reports'
  const expensePage=mode==='expenses'
  const [range,setRange]=useState(defaultRange)
  const [source,setSource]=useState('')
  const [category,setCategory]=useState('')
  const [tab,setTab]=useState(expensePage?'expenses':'payments')
  const [report,setReport]=useState('Profit and Loss')
  const [busy,setBusy]=useState(false)
  const filteredSource=reporting&&report==='Wedding Revenue'?'events':reporting&&report==='Exposing Revenue'?'exposing_jobs':source
  const stats=financials(data,range,filteredSource)
  const expenseRows=[...stats.expenses,...stats.team.map(row=>({...row,id:'team-'+row.id,name:data.team_members.find(p=>p.id===row.memberId)?.name||'Team member',category:'Team Payments',paid:true,teamTransaction:true}))].filter(row=>!category||row.category===category)
  const paymentColumns=[['Date',row=>dateLabel(row.date)],['Booking',row=>bookingName(data,row)],['Source',row=>sourceLabel(row.source)],['Method',row=>row.method],['Amount',row=>currency(row.amount)],['Notes',row=>row.notes||'—']]
  const expenseColumns=[['Date',row=>dateLabel(row.date)],['Description',row=>row.name],['Category',row=>row.category],['Booking',row=>bookingName(data,row)],['Amount',row=>currency(row.amount)],['Status',row=>row.paid?'Paid':'Unpaid']]
  const teamColumns=[['Team member',row=>data.team_members.find(item=>item.id===row.memberId)?.name||'—'],...paymentColumns]
  const pending=stats.events.map(row=>({...row,balance:remaining(row,data.payments.filter(p=>p.source===row.collection))})).filter(row=>row.balance>0)
  const pendingColumns=[...simpleBooking,['Outstanding',row=>currency(row.balance)]]
  const totals=[['Booking value',currency(stats.value),Wallet],['Collected revenue',currency(stats.revenue),TrendingUp],['Pending payments',currency(stats.pending),Hourglass],['Recorded expenses',currency(stats.cost),Receipt],['Team payments',currency(stats.teamPaid),Wallet],['Estimated net profit',currency(stats.estimated),TrendingUp],['Cash profit',currency(stats.cash),Wallet]]
  const period={ 'Daily Business':'Today',Weekly:'This Week',Monthly:'This Month',Yearly:'This Year' }
  const profitRows=[...stats.payments.map(row=>({...row,id:'revenue-'+row.id,description:bookingName(data,row),type:'Collected revenue'})),...expenseRows.map(row=>({...row,id:'cost-'+row.id,description:row.name,type:row.category}))].sort((a,b)=>b.date.localeCompare(a.date))
  const profitColumns=[['Date',row=>dateLabel(row.date)],['Description',row=>row.description],['Type',row=>row.type],['Amount',row=>currency(row.amount)]]
  let rows=stats.payments, columns=paymentColumns
  if ((!reporting&&tab==='expenses')||(reporting&&report==='Expense')) {rows=expenseRows;columns=expenseColumns}
  if ((!reporting&&tab==='team_payments')||(reporting&&report==='Team Payment')) {rows=stats.team;columns=teamColumns}
  if ((!reporting&&tab==='pending')||(reporting&&report==='Pending Payment')) {rows=pending;columns=pendingColumns}
  if (reporting&&report==='Client Booking') {rows=stats.events;columns=simpleBooking}
  if (reporting&&(report==='Profit and Loss'||period[report])) {rows=profitRows;columns=profitColumns}
  async function download(type) {
    setBusy(true)
    try {await exportReport(type,report+' Report',columns,rows,stats)}
    catch(error) {toast.error(error.message)} finally {setBusy(false)}
  }
  return <>
    <Heading eyebrow={reporting?'BUSINESS INSIGHTS':'STUDIO ACCOUNTS'} title={reporting?'Reports & analytics':expensePage?'Expenses':'Finance'} subtitle={reporting?'Review business performance and export studio records.':expensePage?'Track and reconcile studio spending.':'Track bookings, payments, expenses and profitability.'}
      action={reporting?<div className="filters"><button className="button secondary" disabled={busy} onClick={()=>download('pdf')}><Download size={17}/> PDF</button><button className="button primary" disabled={busy} onClick={()=>download('xlsx')}><Download size={17}/> Excel</button></div>:<button className="button primary" onClick={()=>openEditor({collection:expensePage||tab==='expenses'?'expenses':tab==='team_payments'?'team_payments':'payments'})}><Plus size={18}/> {expensePage||tab==='expenses'?'Add expense':tab==='team_payments'?'Record team payment':'Record payment'}</button>}/>
    <div className="filters top-filters">{reporting&&<Select aria-label="Report type" value={report} options={reports} onChange={e=>{
      const value=e.target.value
      setReport(value)
      if(period[value]) setRange({preset:period[value],...presets(period[value])})
    }}/>}<DateFilter value={range} onChange={setRange}/>{!['Wedding Revenue','Exposing Revenue'].includes(report)&&<Select aria-label="Revenue source" value={source} onChange={e=>setSource(e.target.value)} placeholder="All sources" options={[{value:'events',label:'Wedding'},{value:'exposing_jobs',label:'Exposing'}]}/>}</div>
    <Metrics items={expensePage?totals.slice(3,5):totals}/>
    {!expensePage&&<Panel title="Revenue and expenses by month"><FinanceChart stats={stats}/></Panel>}
    <Panel title={reporting?report+' Report':expensePage?'Expense history':'Transactions'} action={!reporting&&!expensePage&&<div className="segmented">{[['payments','Payments'],['expenses','Expenses'],['team_payments','Team payments'],['pending','Pending']].map(([key,label])=><button className={tab===key?'selected':''} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>}>
      {columns===expenseColumns&&<div className="filters filter-row"><Select aria-label="Expense category" value={category} onChange={e=>setCategory(e.target.value)} placeholder="All categories" options={expenseCategories}/></div>}
      <Table columns={columns} rows={[...rows].sort((a,b)=>b.date.localeCompare(a.date))} action={!reporting&&columns===expenseColumns?row=>!row.teamTransaction&&<button className="button secondary" onClick={()=>openEditor({collection:'expenses',row})}>Edit</button>:!reporting&&columns===pendingColumns?row=><button className="button secondary" onClick={()=>openEditor({collection:'payments',seed:{bookingKey:row.collection+':'+row.id}})}>Record payment</button>:undefined}/>
    </Panel>
  </>
}

import {useState} from 'react'
import {Link} from 'react-router-dom'
import {CalendarDays,Camera,Clapperboard,Clock3,IndianRupee,Plus,Receipt,TrendingUp,Users,Wallet} from 'lucide-react'
import {useData} from './data'
import {bookings,byDate,currency,dateLabel,financials,recent,today} from './model'
import {active,statuses} from '../functions/domain.js'
import {Badge,DateFilter,Empty,Heading,Panel,Table} from './ui'
import {FinanceChart,Metrics,defaultRange} from './finance'
import {BookingDetail,bookingColumns} from './schedule'

export function Dashboard({openEditor}) {
  const data=useData()
  const [range,setRange]=useState(defaultRange)
  const [detail,setDetail]=useState(null)
  const stats=financials(data,range)
  const all=bookings(data)
  const current=all.filter(row=>active(row)&&row.date===today()).sort(byDate)
  const upcoming=all.filter(row=>active(row)&&row.date>=today()).sort(byDate)
  const dateRangeWedding=stats.events.filter(row=>row.collection==='events')
  const dateRangeExposing=stats.events.filter(row=>row.collection==='exposing_jobs')
  const clients=range.preset==='All Time'?data.clients.length:new Set(dateRangeWedding.map(row=>row.clientId)).size
  const items=[
    ['Total clients',clients,Users],['Wedding bookings',dateRangeWedding.length,Camera],['Exposing jobs',dateRangeExposing.length,Clapperboard],['Total booking value',currency(stats.value),IndianRupee],['Collected revenue',currency(stats.revenue),Wallet],
    ['Pending payments',currency(stats.pending),Clock3],['Total expenses',currency(stats.cost),Receipt],['Team payments',currency(stats.teamPaid),Users],['Estimated net profit',currency(stats.estimated),TrendingUp],['Upcoming events',upcoming.length,CalendarDays]
  ]
  const events=(rows,label)=><div className="event-list">{rows.length?rows.slice(0,5).map(row=><button className="event-row" key={row.id} onClick={()=>setDetail(row)}><span className="event-icon"><CalendarDays size={17}/></span><span><strong>{row.name}</strong><small>{row.category} · {dateLabel(row.date)} · {row.start}</small></span><Badge value={row.status}/></button>):<Empty message={label}/>}</div>
  const action=row=><button className="button secondary" onClick={()=>setDetail(row)}>Details</button>
  const transactions=[...stats.payments.map(p=>({...p,label:'Client payment'})),...stats.team.map(p=>({...p,id:'team-'+p.id,label:'Team payment'})),...stats.expenses.map(p=>({...p,id:'expense-'+p.id,label:p.name}))].sort(recent).slice(0,5)
  return <>
    <Heading eyebrow="STUDIO OVERVIEW" title="Dashboard" subtitle={'Your studio at a glance · '+dateLabel(today())} action={<button className="button primary" onClick={()=>openEditor({collection:'events'})}><Plus size={18}/> New booking</button>}/>
    <div className="section-line"><h2>Business overview</h2><DateFilter value={range} onChange={setRange}/></div>
    <Metrics items={items}/>
    <div className="dashboard-split"><Panel title="Revenue vs expenses"><FinanceChart stats={stats}/></Panel><Panel title="Upcoming events" action={<Link className="text-link" to="/calendar">View calendar</Link>}>{events(upcoming,'No upcoming events.')}</Panel></div>
    <div className="dashboard-split equal"><Panel title="Today’s events">{events(current,'No events scheduled today.')}</Panel><Panel title="Booking status overview"><div className="status-list">{statuses.map(status=>{
      const count=all.filter(row=>row.status===status&&(!range.from||row.date>=range.from)&&(!range.to||row.date<=range.to)).length
      return <div key={status}><Badge value={status}/><strong>{count}</strong></div>
    })}</div></Panel></div>
    <div className="dashboard-split equal"><Panel title="Monthly revenue"><FinanceChart stats={stats} mode="revenue"/></Panel><Panel title="Monthly expenses"><FinanceChart stats={stats} mode="expenses"/></Panel></div>
    <Panel title="Recent wedding bookings" action={<Link className="text-link" to="/wedding">View bookings</Link>}><Table rows={[...dateRangeWedding].sort(recent).slice(0,5)} columns={bookingColumns} action={action}/></Panel>
    <Panel title="Recent exposing jobs" action={<Link className="text-link" to="/exposing">View jobs</Link>}><Table rows={[...dateRangeExposing].sort(recent).slice(0,5)} columns={bookingColumns} action={action}/></Panel>
    <Panel title="Recent transactions" action={<Link className="text-link" to="/finance">View finance</Link>}><Table rows={transactions} columns={[[ 'Transaction',row=>row.label],['Date',row=>dateLabel(row.date)],['Amount',row=>currency(row.amount)]]}/></Panel>
    {detail&&<BookingDetail row={detail} close={()=>setDetail(null)} edit={row=>{setDetail(null);openEditor({collection:row.collection,row})}} pay={row=>{setDetail(null);openEditor({collection:'payments',seed:{bookingKey:row.collection+':'+row.id}})}}/>}
  </>
}

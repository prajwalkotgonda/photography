import {useState} from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGrid from '@fullcalendar/daygrid'
import timeGrid from '@fullcalendar/timegrid'
import list from '@fullcalendar/list'
import interaction from '@fullcalendar/interaction'
import {Plus,TriangleAlert} from 'lucide-react'
import {useLocation} from 'react-router-dom'
import {exposingRoles,statuses,bookingConflict,paidFor,remaining,paymentStatus} from '../functions/domain.js'
import {bookings,byDate,currency,dateLabel,today} from './model'
import {useData} from './data'
import {categoryOptions,RecordModal} from './forms'
import {Badge,Heading,Modal,Panel,Select,Table} from './ui'
import './calendar.css'

const bookingColors={
  wedding:{label:'Wedding',background:'#e4f3eb',accent:'#287453',text:'#164732'},
  exposing:{label:'Exposing',background:'#f0ebff',accent:'#7857de',text:'#4c3294'},
  cancelled:{label:'Cancelled',background:'#edf0f3',accent:'#778391',text:'#414d5b'}
}

export const bookingColumns=[['Client / studio',row=><strong>{row.name}</strong>],['Event',row=>row.category],['Schedule',row=>dateLabel(row.date)+' · '+row.start],['Location',row=>row.location],['Value',row=>currency(row.amount)],['Status',row=><Badge value={row.status}/>]]
export function Calendar({rows,inspect,add,initialDate}) {
  return <div className="booking-calendar">
    <FullCalendar plugins={[dayGrid,timeGrid,list,interaction]} initialView="dayGridMonth" initialDate={initialDate} height="auto"
    headerToolbar={{start:'title',end:'today prev,next'}}
    footerToolbar={{start:'dayGridMonth,timeGridWeek,timeGridDay,listMonth'}}
    buttonText={{today:'Today',month:'Month',week:'Week',day:'Day',list:'Agenda'}}
    fixedWeekCount={false}
    views={{dayGridMonth:{eventDisplay:'list-item',dayHeaderFormat:{weekday:'narrow'}}}}
    eventInteractive
    eventDidMount={({el,event,view})=>{
      if (view.type!=='dayGridMonth') return
      const {start,end}=event.extendedProps.row
      const description=event.title+' · '+start+'–'+end
      el.title=description
      el.setAttribute('aria-label',description)
    }}
    viewClassNames={add?'calendar-can-book':''}
    nowIndicator dayMaxEvents={3} eventDisplay="block" displayEventEnd eventTimeFormat={{hour:'2-digit',minute:'2-digit',hour12:false}}
    noEventsContent="No bookings in this period."
    events={rows.map(row=>{
      const colors=bookingColors[row.status==='Cancelled'?'cancelled':row.collection==='events'?'wedding':'exposing']
      return {id:row.id,title:row.name+' · '+row.category,start:row.date+'T'+row.start,end:row.date+'T'+row.end,extendedProps:{row},backgroundColor:colors.background,borderColor:colors.accent,textColor:colors.text}
    })}
    eventClick={info=>inspect(info.event.extendedProps.row)}
    dateClick={add?info=>add({date:info.dateStr.slice(0,10),...(info.allDay?{}:{start:info.dateStr.slice(11,16),end:info.dateStr.slice(11,16)<'23:00'?String(Number(info.dateStr.slice(11,13))+1).padStart(2,'0')+info.dateStr.slice(13,16):'23:59'})}):undefined}/>
    <ul className="calendar-legend" aria-label="Booking colors">
      {Object.values(bookingColors).map(({label,accent})=><li key={label}><span style={{backgroundColor:accent}} aria-hidden="true"/>{label}</li>)}
    </ul>
  </div>
}

export function BookingDetail({row,close,edit,pay}) {
  const data=useData()
  const current=bookings(data).find(item=>item.id===row.id&&item.collection===row.collection)||row
  const ledger=data.payments.filter(item=>item.source===current.collection)
  const conflicts=bookings(data).filter(item=>item.id!==current.id&&bookingConflict(current,item))
  const details=[
    ['Booking ID',current.id],['Event',current.category],['Date',dateLabel(current.date)],['Time',current.start+' - '+current.end],
    ['Location',[current.venue,current.location].filter(Boolean).join(', ')],['Contact',current.phone],['Package',current.packageSnapshot?.name],
    ['Services',current.services?.map(item=>item.name).join(', ')],['Roles',current.roles?.join(', ')],['Team',current.assignments?.map(item=>item.name).join(', ')],
    ['Booking amount',currency(current.amount)],['Collected',currency(paidFor(ledger,current.id))],['Remaining',currency(remaining(current,ledger))],['Payment status',paymentStatus(current,ledger)],['Notes',current.notes]
  ]
  return <Modal title={current.name} close={close}><Badge value={current.status}/><dl className="detail-grid">{details.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{conflicts.length>0&&<p className="form-error">Schedule overlaps with {conflicts.map(item=>item.name).join(', ')}.</p>}
    <h3>Payment history</h3><Table columns={[[ 'Date',p=>dateLabel(p.date)],['Amount',p=>currency(p.amount)],['Method',p=>p.method],['Notes',p=>p.notes||'—']]} rows={ledger.filter(p=>p.bookingId===current.id)}/>
    <div className="form-actions">{pay&&remaining(current,ledger)>0&&<button className="button secondary" onClick={()=>pay(current)}>Record payment</button>}{edit&&<button className="button primary" onClick={()=>edit(current)}>Edit booking</button>}</div>
  </Modal>
}

export function Schedule({mode,openEditor}) {
  const data=useData()
  const location=useLocation()
  const [localEditor,setLocalEditor]=useState(null)
  const edit=openEditor||setLocalEditor
  const [detail,setDetail]=useState(null)
  const [role,setRole]=useState('')
  const [source,setSource]=useState('')
  const [category,setCategory]=useState('')
  const [team,setTeam]=useState('')
  const [status,setStatus]=useState('')
  const [query,setQuery]=useState('')
  const [view,setView]=useState('calendar')
  const wedding=mode==='events'
  const exposing=mode==='exposing_jobs'
  const unified=!wedding&&!exposing
  const rows=(unified?bookings(data):data[mode]).filter(row=>
    (!source||row.collection===source)&&(!category||row.category===category)&&(!team||row.assignments?.some(item=>item.id===team))&&(!status||row.status===status)&&(!role||!exposing||row.roles?.includes(role))&&
    [row.name,row.location,row.id].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort(byDate)
  const conflicts=rows.filter(row=>bookings(data).some(other=>other.id!==row.id&&bookingConflict(row,other)))
  const add=seed=>edit({collection:wedding?'events':mode,seed:{...seed,...(exposing&&role?{roles:[role]}:{})}})
  const initial=location.state?.recordId&&bookings(data).find(item=>item.id===location.state.recordId)
  return <>
    <Heading eyebrow="SCHEDULING" title={wedding?'Wedding bookings':exposing?'Exposing jobs':'Studio calendar'} subtitle={wedding?'Manage studio bookings, services and on-site teams.':exposing?'Manage external assignments by photography role.':'Review studio events, external jobs and team assignments.'} action={!unified&&<button className="button primary" onClick={()=>add({date:today()})}><Plus size={18}/> New booking</button>}/>
    <Panel title="Schedule" action={!exposing&&<div className="segmented"><button className={view==='calendar'?'selected':''} onClick={()=>setView('calendar')}>Calendar</button><button className={view==='table'?'selected':''} onClick={()=>setView('table')}>Bookings</button></div>}>
      <div className="filters filter-row">
        <input aria-label="Search bookings" placeholder="Search bookings" value={query} onChange={e=>setQuery(e.target.value)}/>
        {exposing&&<Select aria-label="Photography role" value={role} onChange={e=>setRole(e.target.value)} placeholder="All roles" options={exposingRoles}/>}
        {unified&&<Select aria-label="Event source" value={source} onChange={e=>setSource(e.target.value)} placeholder="All events" options={[{value:'events',label:'Wedding'},{value:'exposing_jobs',label:'Exposing'}]}/>}
        <Select aria-label="Event category" value={category} onChange={e=>setCategory(e.target.value)} options={[...new Set([...categoryOptions(data),...bookings(data).map(row=>row.category)])]} placeholder="All categories"/>
        <Select aria-label="Team member" value={team} onChange={e=>setTeam(e.target.value)} options={data.team_members.map(row=>({value:row.id,label:row.name}))} placeholder="All team members"/>
        <Select aria-label="Booking status" value={status} onChange={e=>setStatus(e.target.value)} options={statuses} placeholder="All statuses"/>
      </div>
      {conflicts.length>0&&<div className="availability danger"><TriangleAlert size={18}/> {conflicts.length} bookings with overlapping assignments</div>}
      {view==='calendar'||exposing?<div className="calendar-wrap"><Calendar key={location.key} rows={rows} initialDate={initial?.date} inspect={setDetail} add={!unified?add:undefined}/></div>:<Table rows={rows} columns={bookingColumns} action={row=><button className="button secondary" onClick={()=>setDetail(row)}>Details</button>}/>}
    </Panel>
    {detail&&<BookingDetail row={detail} close={()=>setDetail(null)} edit={row=>{setDetail(null);edit({collection:row.collection,row})}} pay={row=>{setDetail(null);edit({collection:'payments',seed:{bookingKey:row.collection+':'+row.id}})}}/>}
    {localEditor&&<RecordModal editor={localEditor} close={()=>setLocalEditor(null)}/>}
  </>
}

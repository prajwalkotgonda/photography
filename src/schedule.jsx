import {useState} from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGrid from '@fullcalendar/timegrid'
import list from '@fullcalendar/list'
import interaction from '@fullcalendar/interaction'
import {ChevronLeft,ChevronRight,Plus,TriangleAlert} from 'lucide-react'
import {addMonths,eachDayOfInterval,endOfMonth,endOfWeek,format,isSameMonth,parseISO,startOfMonth,startOfWeek} from 'date-fns'
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
const bookingColor=row=>bookingColors[row.status==='Cancelled'?'cancelled':row.collection==='events'?'wedding':'exposing']
const calendarViews={month:'Month',timeGridWeek:'Week',timeGridDay:'Day',listMonth:'Agenda'}
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export const bookingColumns=[['Client / studio',row=><strong>{row.name}</strong>],['Event',row=>row.category],['Schedule',row=>dateLabel(row.date)+' · '+row.start],['Location',row=>row.location],['Value',row=>currency(row.amount)],['Status',row=><Badge value={row.status}/>]]
export function Calendar({rows,inspect,add,initialDate}) {
  const [view,setView]=useState('month')
  const [selected,setSelected]=useState(()=>initialDate||today())
  const date=parseISO(selected)
  const currentDay=today()
  const monthTitle=format(date,'MMMM yyyy')
  const bookingsByDay=new Map()
  for (const row of rows) {
    if (!bookingsByDay.has(row.date)) bookingsByDay.set(row.date,[])
    bookingsByDay.get(row.date).push(row)
  }
  const selectedRows=bookingsByDay.get(selected)||[]
  const moveMonth=step=>setSelected(format(startOfMonth(addMonths(date,step)),'yyyy-MM-dd'))
  const days=eachDayOfInterval({start:startOfWeek(startOfMonth(date)),end:endOfWeek(endOfMonth(date))})

  return <div className="booking-calendar">
    <div className="booking-calendar-views" role="group" aria-label="Calendar view">
      {Object.entries(calendarViews).map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}
    </div>
    {view==='month'?<div className="calendar-month-layout">
      <section className="calendar-month-card" aria-label="Monthly calendar">
        <header className="calendar-month-header">
          <h3 aria-live="polite">{monthTitle}</h3>
          <div className="calendar-month-nav">
            <button type="button" className="calendar-today" onClick={()=>setSelected(currentDay)}>Today</button>
            <button type="button" aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft size={17}/></button>
            <button type="button" aria-label="Next month" onClick={()=>moveMonth(1)}><ChevronRight size={17}/></button>
          </div>
        </header>
        <div className="calendar-month-grid">
          {weekdays.map(day=><abbr key={day} title={day}>{day[0]}</abbr>)}
          {days.map(day=>{
            const key=format(day,'yyyy-MM-dd')
            const bookings=bookingsByDay.get(key)||[]
            const colors=[...new Set(bookings.map(bookingColor))]
            return <button type="button" className="calendar-date" key={key} data-outside={!isSameMonth(date,day)} aria-current={key===currentDay?'date':undefined} aria-pressed={key===selected} aria-label={format(day,'EEEE, MMMM d, yyyy')+(bookings.length?', '+bookings.length+(bookings.length===1?' booking':' bookings'):'')} onClick={()=>setSelected(key)}>
              <span className="calendar-date-number">{day.getDate()}</span>
              <span className="calendar-dots" aria-hidden="true">{colors.map(({label,accent})=><span key={label} style={{backgroundColor:accent}}/>)}</span>
            </button>
          })}
        </div>
      </section>
      <section className="calendar-day-card" aria-label="Bookings on selected date">
        <header className="calendar-day-header">
          <h3 aria-live="polite">{format(date,'EEEE, MMMM d')}</h3>
          {add&&<button type="button" className="button secondary" onClick={()=>add({date:selected})}><Plus size={16}/> Add booking</button>}
        </header>
        {selectedRows.length>0?<ul className="calendar-day-bookings">
          {selectedRows.map(row=><li key={row.collection+':'+row.id}><button type="button" onClick={()=>inspect(row)}>
            <span className="calendar-booking-dot" style={{backgroundColor:bookingColor(row).accent}} aria-hidden="true"/>
            <span><strong>{row.name}</strong><small>{row.start}–{row.end} · {row.category}</small></span>
            <ChevronRight size={16} aria-hidden="true"/>
          </button></li>)}
        </ul>:<p className="calendar-empty">No bookings on this date.</p>}
      </section>
    </div>:<FullCalendar key={view} plugins={[timeGrid,list,interaction]} initialView={view} initialDate={selected} height="auto"
    headerToolbar={{start:'title',end:'today prev,next'}}
    buttonText={{today:'Today'}}
    datesSet={({view})=>setSelected(format(view.calendar.getDate(),'yyyy-MM-dd'))}
    eventInteractive
    viewClassNames={add?'calendar-can-book':''}
    nowIndicator eventDisplay="block" displayEventEnd eventTimeFormat={{hour:'2-digit',minute:'2-digit',hour12:false}}
    noEventsContent="No bookings in this period."
    events={rows.map(row=>{
      const colors=bookingColor(row)
      return {id:row.id,title:row.name+' · '+row.category,start:row.date+'T'+row.start,end:row.date+'T'+row.end,extendedProps:{row},backgroundColor:colors.background,borderColor:colors.accent,textColor:colors.text}
    })}
    eventClick={info=>inspect(info.event.extendedProps.row)}
    dateClick={add?info=>add({date:info.dateStr.slice(0,10),...(info.allDay?{}:{start:info.dateStr.slice(11,16),end:info.dateStr.slice(11,16)<'23:00'?String(Number(info.dateStr.slice(11,13))+1).padStart(2,'0')+info.dateStr.slice(13,16):'23:59'})}):undefined}/>}
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

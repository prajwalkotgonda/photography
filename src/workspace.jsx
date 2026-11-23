import {useState} from 'react'
import {signOut} from 'firebase/auth'
import {Link,NavLink,Navigate,Route,Routes,useLocation,useNavigate} from 'react-router-dom'
import {Bell,CalendarDays,Camera,ChevronDown,Clapperboard,FolderOpen,LayoutDashboard,LogOut,Menu,Package,PanelLeftClose,Receipt,Search,Settings,Users,Wallet,X} from 'lucide-react'
import {auth} from './firebase'
import {useData} from './data'
import {Dashboard} from './dashboard'
import {Catalog} from './catalog'
import {Finance} from './finance'
import {BookingDetail,Schedule} from './schedule'
import {RecordModal} from './forms'
import {bookings,byDate,dateLabel,today} from './model'
import {active} from '../functions/domain.js'
import toast from 'react-hot-toast'
import {Brand} from './brand'

const groups=[
  ['WORKSPACE',[['/','Dashboard',LayoutDashboard],['/wedding','Wedding bookings',Camera],['/exposing','Exposing jobs',Clapperboard],['/calendar','Calendar',CalendarDays]]],
  ['STUDIO',[['/clients','Clients',Users],['/packages','Packages',Package],['/team','Team',Users]]],
  ['ACCOUNTS',[['/finance','Finance',Wallet],['/expenses','Expenses',Receipt],['/reports','Reports',FolderOpen]]],
  ['PREFERENCES',[['/settings','Settings',Settings]]]
]
export default function Workspace({user}) {
  const location=useLocation()
  const go=useNavigate()
  const data=useData()
  const [collapsed,setCollapsed]=useState(false)
  const [mobile,setMobile]=useState(false)
  const [editor,setEditor]=useState(null)
  const [detail,setDetail]=useState(null)
  const [popover,setPopover]=useState('')
  const [search,setSearch]=useState('')
  const all=bookings(data)
  const upcoming=all.filter(row=>active(row)&&row.date>=today()).sort(byDate).slice(0,5)
  const query=search.trim().toLowerCase()
  const results=query?[
    ...all.map(row=>({row,label:row.category,kind:'booking'})),
    ...[['clients','Client'],['team_members','Team member'],['packages','Package']].flatMap(([name,label])=>data[name].map(row=>({row,label,kind:name})))
  ].filter(item=>[item.row.name,item.row.id,item.row.phone,item.row.location,item.label].join(' ').toLowerCase().includes(query)).slice(0,8):[]
  const nav=groups.flatMap(([,items])=>items)
  const title=nav.find(([path])=>path===location.pathname)?.[1]||'Dashboard'
  function openResult(item){
    setSearch('');setPopover('')
    if(item.kind==='booking')setDetail(item.row)
    else go('/'+(item.kind==='team_members'?'team':item.kind),{state:{recordId:item.row.id}})
  }
  return <div className={'workspace '+(collapsed?'collapsed':'')}>
    {mobile&&<button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
    <aside className={'sidebar '+(mobile?'mobile-open':'')}>
      <Link to="/" className="brand-link" onClick={()=>setMobile(false)}><Brand/></Link>
      <nav>{groups.map(([group,items])=><div className="nav-group" key={group}><span>{group}</span>{items.map(([path,label,Icon])=><NavLink end={path==='/'} key={path} to={path} title={label} onClick={()=>{setMobile(false);setPopover('');setSearch('')}}><Icon size={18}/><span>{label}</span></NavLink>)}</div>)}</nav>
      <button className="collapse-button icon" aria-label="Collapse navigation" onClick={()=>setCollapsed(!collapsed)}><PanelLeftClose size={18}/><span>{collapsed?'Expand':'Collapse'}</span></button>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="breadcrumb"><button className="icon mobile-toggle" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={21}/></button><span>Studio</span><span aria-hidden="true">/</span><strong>{title}</strong></div><div className="top-actions">
      <div className="search-box"><Search size={17}/><input aria-label="Global search" placeholder="Search studio…" value={search} onFocus={()=>setPopover('search')} onChange={e=>{setSearch(e.target.value);setPopover('search')}} onKeyDown={e=>{if(e.key==='Escape')setPopover('');if(e.key==='Enter'&&results[0])openResult(results[0])}}/>{search&&<button className="icon" aria-label="Clear search" onClick={()=>setSearch('')}><X size={14}/></button>}
      {popover==='search'&&query&&<div className="popover search-results">{results.length?results.map(item=><button key={item.kind+item.row.id} onClick={()=>openResult(item)}><strong>{item.row.name}</strong><small>{item.label}</small></button>):<p>No matching records.</p>}</div>}</div>
      <div className="top-pop"><button className="icon notification" aria-label="Notifications" aria-expanded={popover==='notifications'} onClick={()=>setPopover(popover==='notifications'?'':'notifications')}><Bell size={20}/>{upcoming.length>0&&<i/>}</button>
      {popover==='notifications'&&<div className="popover"><h3>Upcoming reminders</h3>{upcoming.length?upcoming.map(row=><button key={row.id} onClick={()=>openResult({row,kind:'booking'})}><strong>{row.name}</strong><small>{dateLabel(row.date)} · {row.start}</small></button>):<p>No upcoming events.</p>}</div>}</div>
      <div className="top-pop"><button className="user-button" aria-label="Admin profile" aria-expanded={popover==='profile'} onClick={()=>setPopover(popover==='profile'?'':'profile')}><span className="avatar">AK</span><span>Admin</span><ChevronDown size={15}/></button>
      {popover==='profile'&&<div className="popover"><h3>{user.email}</h3><button onClick={()=>signOut(auth).catch(error=>toast.error(error.message))}><LogOut size={17}/> Sign out</button></div>}</div>
    </div></header>
    <main className="content"><Routes>
      <Route path="/" element={<Dashboard openEditor={setEditor}/>}/>
      <Route path="/wedding" element={<Schedule key="wedding" mode="events" openEditor={setEditor}/>}/>
      <Route path="/exposing" element={<Schedule key="exposing" mode="exposing_jobs" openEditor={setEditor}/>}/>
      <Route path="/calendar" element={<Schedule key="calendar" mode="unified" openEditor={setEditor}/>}/>
      {[['clients','clients'],['packages','packages'],['team','team_members'],['settings','settings']].map(([path,collection])=><Route key={path} path={'/'+path} element={<Catalog key={location.key+'-'+path} collection={collection} openEditor={setEditor}/>}/>)}
      {['finance','expenses','reports'].map(mode=><Route key={mode} path={'/'+mode} element={<Finance key={mode} mode={mode} openEditor={setEditor}/>}/>)}
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes></main></div>
    {editor&&<RecordModal editor={editor} close={()=>setEditor(null)}/>}
    {detail&&<BookingDetail row={detail} close={()=>setDetail(null)} edit={row=>{setDetail(null);setEditor({collection:row.collection,row})}} pay={row=>{setDetail(null);setEditor({collection:'payments',seed:{bookingKey:row.collection+':'+row.id}})}}/>}
  </div>
}

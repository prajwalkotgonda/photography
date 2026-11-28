import {useEffect,useState} from 'react'
import {Plus} from 'lucide-react'
import toast from 'react-hot-toast'
import {useLocation} from 'react-router-dom'
import {categories,services,sum} from '../functions/domain.js'
import {useData} from './data'
import {save,loadPhoto} from './firebase'
import {bookings,currency,dateLabel,sourceLabel} from './model'
import {Badge,Heading,Modal,Panel,Select,Table} from './ui'
import {categoryOptions} from './forms'
import {bookingColumns} from './schedule'

const config={
  clients:['Clients','Contacts, booking histories and outstanding balances.','client'],
  packages:['Packages','Manage service packages and category pricing.','package'],
  team_members:['Team','Manage your roster, assignments and team payments.','team member'],
  settings:['Settings','Manage event categories and photography services.','event category']
}
const status=['Active','Inactive','Archived']
function Photo({path,name}) {
  const [url,setUrl]=useState('')
  useEffect(()=>{
    if(!path) return
    let running=true
    let object
    loadPhoto(path).then(blob=>{
      if(running) {object=URL.createObjectURL(blob);setUrl(object)}
    }).catch(()=>{})
    return ()=>{running=false;if(object) URL.revokeObjectURL(object)}
  },[path])
  return url?<img className="profile-photo" src={url} alt={name}/>:null
}
export function Catalog({collection,openEditor}) {
  const data=useData()
  const location=useLocation()
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const [state,setState]=useState('')
  const [tab,setTab]=useState('settings')
  const [selected,setSelected]=useState(location.state?.recordId||'')
  const [archive,setArchive]=useState(null)
  const [archiving,setArchiving]=useState(false)
  const [title,subtitle,singular]=config[collection]
  const name=collection==='settings'?tab:collection
  const systemDefaults=name==='settings'?categories:name==='services'?services:[]
  const rows=[...data[name],...systemDefaults.map((item,index)=>({id:'builtin-'+index,name:item,status:'Active',builtIn:true,price:0})).filter(item=>!data[name].some(row=>row.name===item.name||row.id===item.id))].filter(row=>
    [row.name,row.phone,row.role].join(' ').toLowerCase().includes(query.trim().toLowerCase())&&(!category||row.category===category)&&(!state||row.status===state)
  ).sort((a,b)=>a.name.localeCompare(b.name))
  const row=data[name].find(item=>item.id===selected)
  const edit=item=>openEditor({collection:name,...(item?{row:item}:{})})
  const history=row?bookings(data).filter(item=>name==='clients'?item.clientId===row.id:item.assignments?.some(person=>person.id===row.id)):[]
  const matching=data.payments.filter(p=>history.some(item=>item.id===p.bookingId&&item.collection===p.source))
  const teamPayments=data.team_payments.filter(p=>p.memberId===selected)
  const earnings=history.filter(item=>item.status!=='Cancelled').reduce((total,item)=>total+(item.assignments?.find(person=>person.id===selected)?.fee||0),0)
  const columns=[['Name',item=><strong>{item.name}</strong>],
    ...(name==='clients'?[['Mobile',item=>item.phone],['Email',item=>item.email||'—']]:[]),
    ...(name==='team_members'?[['Role',item=>item.role],['Per event',item=>currency(item.fee)]]:[]),
    ...(name==='packages'?[['Category',item=>item.category],['Services',item=>item.services.join(', ')||'—']]:[]),
    ...(['packages','services'].includes(name)?[['Price',item=>currency(item.price)]]:[]),
    ['Status',item=><Badge value={item.status}/>]]
  async function confirmArchive() {
    setArchiving(true)
    try {
      const {id,createdAt,updatedAt,...body}=archive
      await save(name,id,crypto.randomUUID(),{...body,status:'Archived'})
      toast.success('Record archived')
      setArchive(null)
    } catch(error) {toast.error(error.message)} finally {setArchiving(false)}
  }
  return <>
    <Heading eyebrow={collection==='settings'?'PREFERENCES':'STUDIO MANAGEMENT'} title={title} subtitle={subtitle} action={<button className="button primary" onClick={()=>edit()}><Plus size={18}/> New {name==='services'?'service':singular}</button>}/>
    <Panel title={collection==='settings'?(tab==='settings'?'Event categories':'Photography services'):title} action={collection==='settings'&&<div className="segmented"><button className={tab==='settings'?'selected':''} onClick={()=>{setTab('settings');setSelected('')}}>Categories</button><button className={tab==='services'?'selected':''} onClick={()=>{setTab('services');setSelected('')}}>Services</button></div>}>
      <div className="filters filter-row"><input aria-label={'Search '+title.toLowerCase()} placeholder={'Search '+title.toLowerCase()} value={query} onChange={e=>setQuery(e.target.value)}/>
        {name==='packages'&&<Select aria-label="Event category" value={category} onChange={e=>setCategory(e.target.value)} placeholder="All categories" options={[...new Set([...categoryOptions(data),...data.packages.map(item=>item.category)])]}/>}
        <Select aria-label="Record status" value={state} onChange={e=>setState(e.target.value)} placeholder="All statuses" options={status}/>
      </div>
      <Table columns={columns} rows={rows} action={item=><div className="row-actions">{!item.builtIn&&collection!=='settings'&&<button className="button secondary" onClick={()=>setSelected(item.id)}>View</button>}<button className="button secondary" onClick={()=>edit(item)}>Edit</button>{!item.builtIn&&item.status!=='Archived'&&<button className="button secondary" onClick={()=>setArchive(item)}>Archive</button>}</div>}/>
    </Panel>
    {collection==='settings'&&<Panel title="Recent activity"><Table rows={[...data.audit_logs].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))} columns={[[ 'Action',item=>item.action],['Collection',item=>item.collection],['Record',item=>item.recordId],['Timestamp',item=>item.createdAt?.toDate?item.createdAt.toDate().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):(item.createdAt?new Date(item.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—')]]}/></Panel>}
    {row&&<Modal title={row.name} close={()=>setSelected('')}><Photo path={row.photoPath} name={row.name}/><Badge value={row.status}/><dl className="detail-grid">{[['Phone',row.phone],['Email',row.email],['Address',row.address],['Role',row.role],['Category',row.category],['Price',row.price!==undefined?currency(row.price):undefined],['Services',row.services?.join(', ')],['Photographers',row.photographers],['Videographers',row.videographers],['Album',row.album],['Additional services',row.additional],['Notes',row.notes]].filter(([,value])=>value!==undefined&&value!=='').map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {name==='clients'&&<><div className="metric-inline"><span>Booking value <strong>{currency(sum(history.filter(item=>item.status!=='Cancelled'),'amount'))}</strong></span><span>Paid <strong>{currency(sum(matching,'amount'))}</strong></span><span>Pending <strong>{currency(history.filter(item=>item.status!=='Cancelled').reduce((total,item)=>total+item.amount-sum(matching.filter(p=>p.bookingId===item.id&&p.source===item.collection),'amount'),0))}</strong></span></div><h3>Booking history</h3><Table rows={history} columns={bookingColumns}/></>}
      {name==='team_members'&&<><div className="metric-inline"><span>Assigned events <strong>{history.length}</strong></span><span>Earnings <strong>{currency(earnings)}</strong></span><span>Paid <strong>{currency(sum(teamPayments,'amount'))}</strong></span><span>Remaining <strong>{currency(earnings-sum(teamPayments,'amount'))}</strong></span></div><h3>Work history</h3><Table rows={history} columns={bookingColumns}/><h3>Payment history</h3><Table rows={teamPayments} columns={[[ 'Date',p=>dateLabel(p.date)],['Type',p=>sourceLabel(p.source)],['Amount',p=>currency(p.amount)],['Method',p=>p.method]]}/></>}
      <div className="form-actions">{name==='clients'&&<button className="button secondary" onClick={()=>{setSelected('');openEditor({collection:'events',seed:{clientId:row.id,name:row.name,phone:row.phone,email:row.email,address:row.address}})}}>New booking</button>}{name==='team_members'&&<button className="button secondary" onClick={()=>{setSelected('');openEditor({collection:'team_payments',seed:{memberId:row.id}})}}>Record team payment</button>}<button className="button primary" onClick={()=>{setSelected('');edit(row)}}>Edit profile</button></div>
    </Modal>}
    {archive&&<Modal title={'Archive '+archive.name+'?'} close={()=>{if(!archiving)setArchive(null)}}><p>Archived records stay available in the studio’s history.</p><div className="form-actions"><button className="button secondary" disabled={archiving} onClick={()=>setArchive(null)}>Cancel</button><button className="button primary" disabled={archiving} onClick={confirmArchive}>{archiving?'Archiving…':'Archive record'}</button></div></Modal>}
  </>
}

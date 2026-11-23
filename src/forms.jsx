import {useRef,useState} from 'react'
import {useForm} from 'react-hook-form'
import toast from 'react-hot-toast'
import {z} from 'zod'
import {categories,services,exposingRoles,teamRoles,statuses,methods,expenseCategories,toPaise,bookingConflict,bookingAmount,overlaps,remaining,paymentStatus} from '../functions/domain.js'
import {save,uploadPhoto} from './firebase'
import {useData} from './data'
import {bookings,currency,rupees,today,sourceLabel} from './model'
import {Field,Select,Modal} from './ui'

const option = row => ({value:row.id,label:row.name})
const activeRows = rows => rows.filter(row=>row.status==='Active')
function choices(defaults,rows) {
  const managed=new Map(rows.map(row=>[row.name,row.status]))
  const untouched=defaults.filter((_,index)=>!rows.some(row=>row.id==='builtin-'+index))
  return [...new Set([...untouched,...managed.keys()])].filter(name=>!managed.has(name)||managed.get(name)==='Active')
}
export const categoryOptions = data => choices(categories,data.settings)
const amounts = ['price','fee','amount','advance','charges','discount','travel','other']
const moneySchema = z.string().regex(/^\d{0,10}(\.\d{1,2})?$/)
const names={events:'wedding booking',exposing_jobs:'exposing booking',team_members:'team member',clients:'client',packages:'package',settings:'event category',services:'service',payments:'payment',expenses:'expense',team_payments:'team payment'}

export function RecordModal({editor,close}) {
  return <Modal title={(editor.row?'Edit ':'New ')+names[editor.collection]} close={close}><RecordForm {...editor} close={close}/></Modal>
}
function RecordForm({collection,row,seed,close}) {
  const data=useData()
  const wedding=collection==='events'
  const exposing=collection==='exposing_jobs'
  const booking=wedding||exposing
  const expense=collection==='expenses'
  const teamPay=collection==='team_payments'
  const transaction=expense||teamPay||collection==='payments'
  const defaults={name:'',phone:'',email:'',address:'',notes:'',date:today(),start:'09:00',end:'12:00',location:'',venue:'',category:expense?'Travel':'Wedding',status:booking?'Confirmed':'Active',method:'Cash',services:[],assignments:[],roles:[],clientId:'',packageId:'',bookingKey:'',memberId:'',photographers:0,videographers:0,album:'',additional:'',paid:false,...seed,...row}
  for (const key of amounts) defaults[key]=rupees(key==='advance'?0:defaults[key])
  defaults.packageId=row?.packageSnapshot?.id || ''
  defaults.bookingKey=row?.bookingId?row.source+':'+row.bookingId:seed?.bookingKey||''
  defaults.assignments=defaults.assignments.map(item=>({...item,fee:rupees(item.fee)}))
  if (wedding) defaults.services=defaults.services.map(item=>({...item,price:rupees(item.price)}))
  const {register,watch,setValue,handleSubmit,formState:{isSubmitting}}=useForm({defaultValues:defaults})
  const values=watch()
  const [stage,setStage]=useState(row?1:0)
  const [error,setError]=useState('')
  const id=useRef(row?.id || (wedding?'WED-':exposing?'EXP-':'')+crypto.randomUUID())
  const operation=useRef({})
  const file=useRef(null)
  const photo=useRef(row?.photoPath)
  const pending=useRef(false)
  const all=bookings(data)
  const [source,bookingId]=values.bookingKey.split(':')
  const linked=all.find(item=>item.collection===source && item.id===bookingId)
  const packages=activeRows(data.packages).filter(item=>item.category===values.category)
  const snapshot=row?.packageSnapshot
  if (snapshot && !packages.some(item=>item.id===snapshot.id)) packages.push(snapshot)
  const pack=values.packageId ? (snapshot?.id===values.packageId?snapshot:packages.find(item=>item.id===values.packageId)) : null
  const included=pack?.services||[]
  const categories=[...new Set([...categoryOptions(data),values.category])]
  const candidate={...values,collection}
  const overlapping=booking?all.filter(item=>item.id!==row?.id&&overlaps(item,candidate)):[]
  const conflicts=overlapping.filter(item=>bookingConflict(item,candidate))
  const payments=data.payments.filter(item=>item.source===collection)
  let total=0
  let advance=0
  try {
    total=wedding?bookingAmount({packageSnapshot:pack,services:values.services.map(item=>({...item,price:toPaise(item.price),included:included.includes(item.name)})),charges:toPaise(values.charges),discount:toPaise(values.discount)}):toPaise(values.amount)
    advance=toPaise(values.advance)
  } catch { /* Validate on submit. */ }
  const input=(key,label,required=false,type='text')=><Field label={label}><input {...register(key,{valueAsNumber:type==='number'})} required={required} type={type} min={type==='number'?0:undefined} maxLength={200}/></Field>
  const select=(key,label,options,placeholder)=><Field label={label}><Select {...register(key)} options={options} placeholder={placeholder} required={placeholder!==undefined}/></Field>
  const cash=(key,label,disabled=false)=><Field label={label}><input {...register(key)} disabled={disabled} inputMode="decimal" pattern="[0-9]{0,10}([.][0-9]{1,2})?"/></Field>
  const setList=(key,value)=>setValue(key,value)
  const changeAssignment=(id,key,value)=>setList('assignments',values.assignments.map(item=>item.id===id?{...item,[key]:value}:item))
  const submit=handleSubmit(async form=>{
    if (booking&&form.end<=form.start) {setError('End time must be after start time.');return}
    if (booking&&!stage) {setStage(1);setError('');return}
    if (pending.current) return
    pending.current=true
    setError('')
    try {
      const {createdAt,updatedAt,id:priorId,bookingId:priorBooking,source:priorSource,...payload}=form
      for (const key of amounts) {
        if (!moneySchema.safeParse(String(form[key]||'')).success) throw new Error('Enter rupee amounts with up to two decimal places.')
        payload[key]=toPaise(form[key])
      }
      if (booking) {
        if (conflicts.length) throw new Error('Resolve overlapping assignments before saving.')
        payload.assignments=form.assignments.map(item=>({...item,fee:toPaise(item.fee)}))
      }
      if (wedding) {
        payload.services=form.services.map(item=>({...item,price:toPaise(item.price),included:included.includes(item.name)}))
        if (!form.clientId) delete payload.clientId
        if (!form.packageId) delete payload.packageId
      }
      if (transaction && bookingId) Object.assign(payload,{source,bookingId})
      if (expense&&row?.generated) Object.assign(payload,{amount:row.amount,category:row.category})
      if (collection==='team_members'&&file.current) {
        photo.current=await uploadPhoto(file.current)
        file.current=null
      }
      if (photo.current) payload.photoPath=photo.current
      const clean=Object.fromEntries(Object.entries(payload).filter(([,value])=>value!==undefined))
      const signature=JSON.stringify(clean)
      if (operation.current.signature!==signature) operation.current={signature,id:crypto.randomUUID()}
      await save(collection,id.current,operation.current.id,clean)
      toast.success(row?'Changes saved':'Record created')
      close()
    } catch (failure) {setError(failure.message || 'Unable to save this record.')} finally {pending.current=false}
  })
  return <form onSubmit={submit}>
    {booking&&<><div className="form-grid">{<Field label="Event category"><Select value={values.category} options={categories} onChange={e=>{setValue('category',e.target.value);setValue('packageId','')}}/></Field>}{input('date','Event date',true,'date')}{input('start','Start time',true,'time')}{input('end','End time',true,'time')}</div><div className={'availability '+(conflicts.length?'danger':'')}><strong>{values.end<=values.start?'Check event times':conflicts.length?'Booked':overlapping.length?'Partially booked':'Available'}</strong>{overlapping.length>0&&<span>{overlapping.map(item=>item.name+' ('+item.start+' - '+item.end+')').join(', ')}</span>}</div></>}
    {(!booking||stage===1)&&<>
      <div className="form-grid">
        {wedding&&<Field label="Existing client"><Select options={data.clients.map(option)} placeholder="New client" value={values.clientId} onChange={e=>{
          const client=data.clients.find(item=>item.id===e.target.value)
          setValue('clientId',e.target.value)
          if(client) for(const key of ['name','phone','email','address']) setValue(key,client[key]||'')
        }}/></Field>}
        {(!transaction||expense)&&input('name',exposing?'Photographer / studio name':wedding?'Client full name':expense?'Expense description':'Name',true)}
        {(booking||['clients','team_members'].includes(collection))&&input('phone','Mobile number',true,'tel')}
        {(wedding||collection==='clients')&&<>{input('email','Email',false,'email')}{input('address','Address')}</>}
        {wedding&&input('venue','Event venue',true)}
        {booking&&<>{input('location','Location',true)}{select('status','Booking status',statuses)}</>}
        {!booking&&!transaction&&select('status','Status',['Active','Inactive','Archived'])}
        {collection==='packages'&&<>{select('category','Event category',categories)}{cash('price','Package price (₹)')}{input('photographers','Photographers',true,'number')}{input('videographers','Videographers',true,'number')}{input('album','Album details')}{input('additional','Additional services')}</>}
        {collection==='services'&&cash('price','Default price (₹)')}
        {collection==='team_members'&&<>{select('role','Professional role',teamRoles,'Choose role')}{cash('fee','Per-event payment (₹)')}<Field label="Profile photo"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{file.current=e.target.files[0]||null}}/></Field></>}
        {wedding&&<Field label="Package"><Select value={values.packageId} onChange={e=>setValue('packageId',e.target.value)} options={packages.map(item=>({value:item.id,label:item.name+' · '+currency(item.price)}))} placeholder="No package"/></Field>}
        {transaction&&<>
          <Field label="Related booking"><Select disabled={Boolean(row?.generated)} value={values.bookingKey} onChange={e=>{setValue('bookingKey',e.target.value);setValue('memberId',seed?.memberId||'')}} options={all.map(item=>({value:item.collection+':'+item.id,label:item.name+' · '+sourceLabel(item.collection)+' · '+item.date}))} placeholder={expense?'No linked booking':'Choose booking'} required={!expense}/></Field>
          {input('date','Transaction date',true,'date')}{cash('amount','Amount (₹)',row?.generated)}
          {!expense&&select('method','Payment method',methods)}
          {teamPay&&select('memberId','Team member',(linked?.assignments||[]).map(option),'Choose member')}
          {expense&&<><Field label="Expense category"><Select options={expenseCategories.filter(name=>name!=='Team Payments')} {...register('category')} disabled={Boolean(row?.generated)}/></Field><label className="check"><input type="checkbox" {...register('paid')}/> Expense paid</label></>}
        </>}
      </div>
      {(wedding||collection==='packages')&&<fieldset><legend>Photography services</legend><div className="check-grid">{[...new Set([...choices(services,data.services),...included,...values.services.map(item=>wedding?item.name:item)])].map(name=>{
        const entry=wedding?values.services.find(item=>item.name===name):values.services.includes(name)
        const packaged=included.includes(name)
        return <div key={name} className="check-row"><label className="check"><input type="checkbox" checked={Boolean(entry||packaged)} disabled={packaged} onChange={e=>setList('services',e.target.checked?[...values.services,wedding?{name,price:rupees(data.services.find(item=>item.name===name)?.price)}:name]:values.services.filter(item=>wedding?item.name!==name:item!==name))}/>{name}</label>{wedding&&entry&&!packaged&&<input aria-label={name+' price'} inputMode="decimal" value={entry.price} onChange={e=>setList('services',values.services.map(item=>item.name===name?{...item,price:e.target.value}:item))}/>}</div>
      })}</div></fieldset>}
      {exposing&&<fieldset><legend>Assigned photography roles</legend><div className="check-grid">{exposingRoles.map(role=><label className="check" key={role}><input type="checkbox" checked={values.roles.includes(role)} onChange={e=>setList('roles',e.target.checked?[...values.roles,role]:values.roles.filter(item=>item!==role))}/>{role}</label>)}</div></fieldset>}
      {booking&&<fieldset><legend>Team assignments</legend><Select aria-label="Add team member" value="" placeholder="Add team member" options={activeRows(data.team_members).filter(item=>!values.assignments.some(a=>a.id===item.id)).map(option)} onChange={e=>{
        const member=data.team_members.find(item=>item.id===e.target.value)
        if(member) setList('assignments',[...values.assignments,{id:member.id,name:member.name,role:member.role,fee:rupees(member.fee)}])
      }}/>{values.assignments.map(person=><div className="assignment" key={person.id}><strong>{person.name}</strong><Select aria-label={person.name+' role'} options={teamRoles} value={person.role} onChange={e=>changeAssignment(person.id,'role',e.target.value)}/><input aria-label={person.name+' fee'} inputMode="decimal" value={person.fee} onChange={e=>changeAssignment(person.id,'fee',e.target.value)}/><button type="button" className="button secondary" onClick={()=>setList('assignments',values.assignments.filter(item=>item.id!==person.id))}>Remove</button></div>)}</fieldset>}
      {booking&&<fieldset><legend>Financial details</legend><div className="form-grid">
        {wedding?<><Field label="Package price"><output>{currency(pack?.price)}</output></Field>{cash('charges','Additional charges (₹)')}{cash('discount','Discount (₹)')}</>:<>{cash('amount','Booking amount (₹)')}{cash('travel','Travel expenses (₹)')}{cash('other','Other expenses (₹)')}</>}
        {!row&&<>{cash('advance','Advance received (₹)')}{select('method','Payment method',methods)}</>}
        <Field label="Final booking amount"><output>{currency(total)}</output></Field><Field label="Remaining"><output>{currency(row?remaining({id:row.id,amount:total},payments):total-advance)}</output></Field><Field label="Payment status"><output>{row?paymentStatus({id:row.id,amount:total},payments):total===advance?'Paid':advance?'Part paid':'Pending'}</output></Field>
      </div></fieldset>}
      <Field label="Notes"><textarea rows="3" maxLength={4000} {...register('notes')}/></Field>
    </>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button secondary" type="button" disabled={isSubmitting} onClick={close}>Cancel</button><button className="button primary" disabled={isSubmitting}>{isSubmitting?'Saving…':booking&&!stage?'Check availability & continue':'Save record'}</button></div>
  </form>
}

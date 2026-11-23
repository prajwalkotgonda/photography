import {useEffect,useState} from 'react'
import {ChevronLeft,ChevronRight,Inbox,X} from 'lucide-react'
import {presets} from './model'
export function Heading({eyebrow,title,subtitle,action}) {
  return <div className="page-heading"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>
}
export function Empty({message='No records yet.'}) {return <div className="empty"><Inbox size={24}/><span>{message}</span></div>}
export function Badge({value}) {return <span className="badge" data-value={value}>{value}</span>}
export function Field({label,children}) {return <label className="field"><span>{label}</span>{children}</label>}
export function Select({options,placeholder,...props}) {
  return <select {...props}>{placeholder!==undefined&&<option value="">{placeholder}</option>}{options.map(option=>{
    const item=typeof option==='string'?{value:option,label:option}:option
    return <option key={item.value} value={item.value}>{item.label}</option>
  })}</select>
}
export function Panel({title,action,children,className=''}) {return <section className={'panel '+className}>{(title||action)&&<header className="panel-head"><h2>{title}</h2>{action}</header>}{children}</section>}
export function Modal({title,close,children}) {
  useEffect(()=>{
    const previous=document.activeElement
    const dialog=document.getElementById('record-dialog')
    dialog.showModal()
    return ()=>{dialog.close();previous?.focus()}
  },[])
  return <dialog id="record-dialog" aria-labelledby="modal-title" onCancel={event=>{event.preventDefault();close()}}><header className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon" aria-label="Close dialog" onClick={close}><X size={19}/></button></header><div className="modal-body">{children}</div></dialog>
}
export function Table({columns,rows,action,empty,pageSize=10}) {
  const [page,setPage]=useState(0)
  const last=Math.max(0,Math.ceil(rows.length/pageSize)-1)
  const current=Math.min(page,last)
  if (!rows.length) return <Empty message={empty}/>
  return <><div className="table-wrap"><table><thead><tr>{columns.map(([name])=><th key={name}>{name}</th>)}{action&&<th>Actions</th>}</tr></thead><tbody>{rows.slice(current*pageSize,(current+1)*pageSize).map(row=><tr key={row.id}>{columns.map(([name,get])=><td key={name}>{get(row)}</td>)}{action&&<td>{action(row)}</td>}</tr>)}</tbody></table></div>{last>0&&<div className="pager"><button className="icon" aria-label="Previous page" disabled={!current} onClick={()=>setPage(current-1)}><ChevronLeft size={18}/></button><span>Page {current+1} of {last+1}</span><button className="icon" aria-label="Next page" disabled={current===last} onClick={()=>setPage(current+1)}><ChevronRight size={18}/></button></div>}</>
}
export function DateFilter({value,onChange}) {
  return <div className="filters"><Select aria-label="Date range" value={value.preset} options={['All Time','Today','This Week','This Month','This Year','Custom Date Range']} onChange={e=>onChange({preset:e.target.value,...presets(e.target.value)})}/>{value.preset==='Custom Date Range'&&<><Field label="From"><input type="date" value={value.from} max={value.to||undefined} onChange={e=>onChange({...value,from:e.target.value})}/></Field><Field label="To"><input type="date" value={value.to} min={value.from||undefined} onChange={e=>onChange({...value,to:e.target.value})}/></Field></>}</div>
}

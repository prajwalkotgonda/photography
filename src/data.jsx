import {createContext, useContext, useEffect, useState} from 'react'
import {subscribe} from './firebase'
export const collections = ['clients','events','exposing_jobs','team_members','packages','services','payments','expenses','team_payments','settings','audit_logs']
const Context = createContext(null)
export const useData = () => useContext(Context)
export function DataProvider({children}) {
  const [data,setData] = useState({})
  const [error,setError] = useState('')
  useEffect(()=>{
    const subscriptions = collections.map(name=>subscribe(name,rows=>setData(previous=>({...previous,[name]:rows})),error=>setError(error.message)))
    return ()=>subscriptions.forEach(unsubscribe=>unsubscribe())
  },[])
  if (error) return <div className="empty" role="alert">{error}</div>
  if (Object.keys(data).length!==collections.length) return <div className="empty" role="status">Loading studio records…</div>
  return <Context.Provider value={data}>{children}</Context.Provider>
}
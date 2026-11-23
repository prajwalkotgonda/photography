import {lazy,Suspense,useEffect,useState} from 'react'
import {doc,getDoc} from 'firebase/firestore'
import {onAuthStateChanged,sendPasswordResetEmail,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {CalendarDays,Users,Wallet} from 'lucide-react'
import {auth,configured,db,persistence} from './firebase'
import {DataProvider} from './data'
import {Field} from './ui'
import {Brand} from './brand'

const Workspace=lazy(()=>import('./workspace'))

function Login({notice}) {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [reset,setReset]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState(false)
  async function submit(event) {
    event.preventDefault()
    if(!configured||busy)return
    setBusy(true);setMessage('');setSuccess(false)
    try {
      if(reset) {
        await sendPasswordResetEmail(auth,email.trim())
        setSuccess(true);setMessage('If that address has an account, a reset email has been requested.')
      } else {
        await persistence()
        await signInWithEmailAndPassword(auth,email.trim(),password)
      }
    } catch(error) {
      setMessage(reset?'The reset request failed. Try again shortly.':error.code==='auth/too-many-requests'?'Too many attempts. Try again later.':'Unable to sign in. Check your credentials and connection.')
    } finally {setBusy(false)}
  }
  return <main className="login"><div className="login-inner"><aside className="login-brand"><Brand/><div><span className="eyebrow">STUDIO MANAGEMENT</span><h1>Capture Moments.<br/>Manage Everything.</h1></div><div className="login-links"><span><CalendarDays size={18}/> Bookings & schedules</span><span><Users size={18}/> Clients & team</span><span><Wallet size={18}/> Payments & reports</span></div></aside><section className="login-form"><span className="eyebrow">ADMIN ACCESS</span><h2>{reset?'Reset password':'Sign in to your studio'}</h2><p>{reset?'Enter the email address for your administrator account.':'Use your administrator account to access the studio workspace.'}</p>
    {!configured&&<div className="availability danger" role="status">Firebase setup is required. See the project README to connect your studio.</div>}
    <form onSubmit={submit}><Field label="Email"><input type="email" value={email} required autoComplete="username" placeholder="name@example.com" onChange={e=>setEmail(e.target.value)}/></Field>
    {!reset&&<Field label="Password"><input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
    {(message||notice)&&<p role="status" className={success?'availability':'form-error'}>{message||notice}</p>}
    <button className="button primary" disabled={busy||!configured}>{busy?'Please wait…':reset?'Send reset email':'Sign in'}</button>
    <button type="button" className="text-link" onClick={()=>{setReset(!reset);setMessage('')}}>{reset?'Back to sign in':'Forgot password?'}</button></form></section></div></main>
}
export function App() {
  const [session,setSession]=useState(configured?undefined:null)
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    if(!auth)return
    let revision=0
    const unsubscribe=onAuthStateChanged(auth,async user=>{
      const token=++revision
      if(!user) {setSession(null);return}
      setSession(undefined)
      try {
        const record=await getDoc(doc(db,'admins','primary'))
        if(token!==revision)return
        if(record.data()?.uid!==user.uid) throw new Error('Administrator access required')
        setNotice('');setSession(user)
      } catch {
        if(token!==revision)return
        setNotice('Studio administrator access could not be verified.')
        setSession(null)
        await signOut(auth).catch(()=>{})
      }
    })
    return ()=>{revision++;unsubscribe()}
  },[])
  if(session===undefined)return <main className="empty full" role="status">Checking studio access…</main>
  if(!session)return <Login notice={notice}/>
  return <Suspense fallback={<main className="empty full" role="status">Loading studio workspace…</main>}><DataProvider><Workspace user={session}/></DataProvider></Suspense>
}

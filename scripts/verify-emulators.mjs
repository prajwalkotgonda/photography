import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {initializeApp,deleteApp} from 'firebase/app'
import {connectAuthEmulator,getAuth,signInWithEmailAndPassword} from 'firebase/auth'
import {connectFirestoreEmulator,doc,getDoc,getFirestore,terminate,setDoc} from 'firebase/firestore'
import {connectFunctionsEmulator,getFunctions,httpsCallable} from 'firebase/functions'
import {connectStorageEmulator,getBytes,getStorage,ref,uploadBytes} from 'firebase/storage'

const require=createRequire(new URL('../functions/package.json',import.meta.url))
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require('firebase-admin/app')
const {getAuth:getAdminAuth}=require('firebase-admin/auth')
const {getFirestore:getAdminFirestore}=require('firebase-admin/firestore')
const projectId='demo-photography'
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
const admin=initializeAdmin({projectId})
const database=getAdminFirestore(admin)
const instances=[]
const run=process.env.STUDIO_TEST_RUN || crypto.randomUUID().slice(0,8)
const date='2026-11-23'
const password='local-emulator-only'
const primary=await getAdminAuth(admin).createUser({email:'admin-'+run+'@example.test',password})
const visitor=await getAdminAuth(admin).createUser({email:'visitor-'+run+'@example.test',password})
await database.doc('admins/primary').set({uid:primary.uid})

async function session(user) {
  const app=initializeApp({projectId,apiKey:'demo-only',appId:'demo-app',storageBucket:projectId+'.appspot.com'},user.uid)
  instances.push(app)
  const auth=getAuth(app)
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true})
  await signInWithEmailAndPassword(auth,user.email,password)
  const db=getFirestore(app)
  connectFirestoreEmulator(db,'127.0.0.1',8080)
  const functions=getFunctions(app)
  connectFunctionsEmulator(functions,'127.0.0.1',5001)
  const storage=getStorage(app)
  connectStorageEmulator(storage,'127.0.0.1',9199)
  return {db,storage,save:httpsCallable(functions,'saveRecord')}
}

try {
  const owner=await session(primary)
  const denied=await session(visitor)
  const write=(collection,id,data,requestId=crypto.randomUUID())=>owner.save({collection,id:run+'-'+id,requestId,data})
  const read=async(collection,id)=>(await getDoc(doc(owner.db,collection,run+'-'+id))).data()
  const reject=(promise,pattern)=>assert.rejects(promise,pattern)
  assert.equal((await getDoc(doc(owner.db,'admins','primary'))).data().uid,primary.uid)
  await reject(getDoc(doc(denied.db,'admins','primary')),{code:'permission-denied'})
  await reject(setDoc(doc(owner.db,'payments','direct'),{amount:100}),{code:'permission-denied'})
  await reject(denied.save({collection:'settings',id:'blocked',requestId:'blocked',data:{name:'Blocked',status:'Active'}}),/administrator/i)
  const path='team/'+primary.uid+'/'+run
  const photo=ref(owner.storage,path)
  const bytes=Uint8Array.of(137,80,78,71)
  await uploadBytes(photo,bytes,{contentType:'image/png'})
  assert.equal((await getBytes(photo)).byteLength,4)
  await reject(getBytes(ref(denied.storage,path)),/unauthorized/i)
  await write('settings','category',{name:'Wedding',status:'Active'})
  await write('services','service',{name:'Candid Photography',price:1000,status:'Active'})
  const team={name:'Studio Photographer',phone:'9876543210',role:'Candid Photographer',fee:25000,status:'Active',photoPath:path}
  await write('team_members','member',team)
  const pack={name:'Wedding package',category:'Wedding',price:100000,services:['Candid Photography'],photographers:1,videographers:0,status:'Active'}
  await write('packages','pack',pack)
  const wedding={name:'Example Client',phone:'8765432109',email:'',date,start:'09:00',end:'11:00',category:'Wedding',location:'Pune',venue:'Studio',status:'Confirmed',assignments:[{id:run+'-member',role:team.role,fee:team.fee}],services:[{name:'Candid Photography',price:5000,included:false}],packageId:run+'-pack',charges:0,discount:0,advance:30000,method:'UPI'}
  const key=crypto.randomUUID()
  await write('events','wedding',wedding,key)
  await write('events','wedding',wedding,key)
  await reject(write('events','duplicate',wedding),/matching booking/i)
  let saved=await read('events','wedding')
  assert.equal(saved.amount,100000)
  assert.equal((await getDoc(doc(owner.db,'clients',saved.clientId))).data().name,wedding.name)
  await write('packages','pack',{...pack,price:150000})
  await write('events','wedding',{...wedding,clientId:saved.clientId})
  saved=await read('events','wedding')
  assert.equal(saved.packageSnapshot.price,100000)
  const job={name:'External Studio',phone:'7654321098',date,start:'10:00',end:'12:00',category:'Wedding',location:'Pune',status:'Confirmed',assignments:wedding.assignments,roles:['Candid Photography','Cinematic Photography'],amount:90000,advance:10000,method:'Cash',travel:3500,other:0}
  await reject(write('exposing_jobs','job',job),/schedule conflict/i)
  await write('exposing_jobs','job',{...job,start:'11:00'})
  assert.equal((await read('exposing_jobs','job')).roles.length,2)
  assert.equal((await read('expenses','job-travel')).amount,3500)
  const payment={source:'events',bookingId:run+'-wedding',amount:60000,date,method:'Bank Transfer'}
  const results=await Promise.allSettled([write('payments','one',payment),write('payments','two',payment)])
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
  const ledger=await database.collection('payments').where('bookingId','==',run+'-wedding').get()
  assert.equal(ledger.docs.reduce((total,p)=>total+p.data().amount,0),90000)
  await write('team_payments','team-payment',{...payment,amount:20000,memberId:run+'-member'})
  await reject(write('team_payments','overpay',{...payment,amount:6000,memberId:run+'-member'}),/outstanding assignment/i)
  const expense={name:'Album print',category:'Album Printing',amount:4000,date,source:'events',bookingId:run+'-wedding',paid:false}
  await write('expenses','expense',expense)
  await write('expenses','expense',{...expense,paid:true})
  assert.equal((await read('expenses','expense')).paid,true)
  assert.ok((await database.collection('audit_logs').where('recordId','==',run+'-wedding').get()).size>=2)
  console.log('Firebase emulator checks passed for authentication, rules, storage, catalog, weddings, exposing, concurrent payments, expenses and audit history.')
} finally {
  await Promise.all(instances.map(async app=>{await terminate(getFirestore(app));await deleteApp(app)}))
  await deleteAdmin(admin)
}

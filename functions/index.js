import {initializeApp} from 'firebase-admin/app'
import {getFirestore, FieldValue} from 'firebase-admin/firestore'
import {onCall, HttpsError} from 'firebase-functions/v2/https'
import {z} from 'zod'
import {bookingCollections, bookingConflict, bookingAmount, statuses, exposingRoles, methods, expenseCategories, active, sum} from './domain.js'

initializeApp()
const db = getFirestore()
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const label = z.string().trim().min(1).max(200)
const notes = z.string().max(4000).optional()
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,22}$/).refine(v=>v.replace(/\D/g,'').length>=7)
const money = z.number().int().min(0).max(999999999999)
const date = z.iso.date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const status = z.enum(['Active','Inactive','Archived'])
const service = z.object({name:label,price:money,included:z.boolean()})
const assignment = z.object({id,role:label,fee:money})
const payment = z.object({amount:money.positive(), date, method:z.enum(methods), notes})
const base = {name:label,date,start:time,end:time,category:label,location:label,status:z.enum(statuses),notes,assignments:z.array(assignment).max(50),advance:money,method:z.enum(methods),settleBalance:z.boolean().optional()}
const catalog = {
  clients:z.object({name:label,phone,email:z.union([z.email(),z.literal('')]),address:notes,notes,status}),
  team_members:z.object({name:label,phone:z.union([phone,z.literal('')]),role:label,fee:money,photoPath:z.string().max(300).optional(),notes,status}),
  packages:z.object({name:label,category:label,price:money,services:z.array(label).max(50),photographers:z.number().int().min(0).max(100),videographers:z.number().int().min(0).max(100),album:notes,additional:notes,notes,status}),
  services:z.object({name:label, price:money,status}),
  settings:z.object({name:label,status}),
}
const schemas = {
  ...catalog,
  events:z.object({...base,clientId:id.optional(),phone,email:z.union([z.email(),z.literal('')]),address:notes,venue:label,packageId:id.optional(),services:z.array(service).max(50),charges:money,discount:money}),
  exposing_jobs:z.object({...base,phone,roles:z.array(z.enum(exposingRoles)).min(1).max(4),amount:money,travel:money,other:money}),
  payments:payment.extend({bookingId:id,source:z.enum(bookingCollections)}),
  team_payments:payment.extend({bookingId:id,source:z.enum(bookingCollections),memberId:id}),
  expenses:z.object({name:label,category:z.enum(expenseCategories.filter(c=>c!=='Team Payments')),amount:money.positive(),date,bookingId:id.optional(),source:z.enum(bookingCollections).optional(),paid:z.boolean(),notes})
}
const invalid = message => {throw new HttpsError('failed-precondition',message)}
const requestSchema = z.object({collection:z.enum(Object.keys(schemas)),id,requestId:id,data:z.unknown()})
const records = snap => snap.docs.map(doc=>doc.data())
const byBooking = (name,bookingId) => db.collection(name).where('bookingId','==',bookingId)
const normalPhone = value => value.replace(/\D/g,'').slice(-10)

export const saveRecord = onCall({region:'us-central1'}, async request=>{
  if (!request.auth) throw new HttpsError('unauthenticated','Sign in to continue.')
  const parsed = requestSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument','Invalid save request.')
  const {collection,id:recordId,requestId,data} = parsed.data
  const validated = schemas[collection].safeParse(data)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    throw new HttpsError('invalid-argument', issue.path.join('.') + ' — ' + issue.message)
  }
  const row = validated.data
  return db.runTransaction(async tx=>{
    const ref = db.collection(collection).doc(recordId)
    const audit = db.collection('audit_logs').doc(requestId)
    // A shared revision serializes scheduling and ledger checks even when queries initially return zero rows.
    const lock = db.doc('_system/write_revision')
    const [admin, previous, replay] = await Promise.all([tx.get(db.doc('admins/primary')),tx.get(ref),tx.get(audit),tx.get(lock)])
    if (admin.data()?.uid !== request.auth.uid) throw new HttpsError('permission-denied','Studio administrator access is required.')
    if (replay.exists) {
      if (replay.data().recordId !== recordId || replay.data().collection !== collection) invalid('This save identifier was already used.')
      return {id:recordId}
    }
    const old = previous.data()
    const now = FieldValue.serverTimestamp()
    const writes = []
    const stage = (target, value, prior) => writes.push([target,{...value,id:target.id,status:value.status || 'Recorded',createdAt:prior?.createdAt || now,updatedAt:now}])
    if (bookingCollections.includes(collection)) {
      if (row.end <= row.start) invalid('End time must be after start time.')
      if (new Set(row.assignments.map(a=>a.id)).size !== row.assignments.length) invalid('Assign a team member only once per booking.')
      const [events,jobs,payments,teamPayments,team] = await Promise.all([
        ...bookingCollections.map(name=>tx.get(db.collection(name).where('date','==',row.date))),
        tx.get(byBooking('payments',recordId)),
        tx.get(byBooking('team_payments',recordId)),
        row.assignments.length ? tx.getAll(...row.assignments.map(person=>db.collection('team_members').doc(person.id))) : []
      ])
      const bookings = [...records(events),...records(jobs)]
      const ledger = records(payments).filter(p=>p.bookingId===recordId && p.source===collection)
      row.collection = collection
      for (const person of row.assignments) {
        const member = team.find(doc=>doc.id===person.id)?.data()
        if (!member || (member.status!=='Active' && !old?.assignments?.some(a=>a.id===person.id))) invalid('Choose an active team member.')
        person.name = member.name
      }
      for (const p of records(teamPayments).filter(p=>p.bookingId===recordId && p.source===collection)) {
        const total = sum(records(teamPayments).filter(item=>item.bookingId===recordId && item.source===collection && item.memberId===p.memberId),'amount')
        if ((row.assignments.find(a=>a.id===p.memberId)?.fee ?? -1) < total) invalid('An assignment cannot be removed or reduced below its recorded team payments.')
      }
      const duplicate = bookings.find(other=>other.collection===collection && other.id!==recordId && active(other) && active(row) &&
        other.date===row.date && other.start===row.start && normalPhone(other.phone)===normalPhone(row.phone) && other.category===row.category)
      if (duplicate) invalid('A matching booking already exists for this contact and start time.')
      const conflict = bookings.find(other=>!(other.id===recordId && other.collection===collection) && bookingConflict(row,other))
      if (conflict) invalid('Schedule conflict with ' + conflict.name + ' at ' + conflict.start + '. Review the date, time or assignments.')
      if (collection==='events') {
        if (row.packageId) {
          if (old?.packageSnapshot?.id===row.packageId) row.packageSnapshot = old.packageSnapshot
          else {
            const pack = (await tx.get(db.collection('packages').doc(row.packageId))).data()
            if (!pack || pack.status!=='Active' || pack.category!==row.category) invalid('Choose an active package for this category.')
            row.packageSnapshot = {...pack}
            delete row.packageSnapshot.createdAt
            delete row.packageSnapshot.updatedAt
          }
        }
        row.services = row.services.map(item=>({...item,included:Boolean(row.packageSnapshot?.services.includes(item.name))}))
        for (const name of row.packageSnapshot?.services || []) {
          if (!row.services.some(item=>item.name===name)) row.services.push({name,price:0,included:true})
        }
        row.amount = bookingAmount(row)
        if (row.amount < 0 || row.amount > 999999999999) invalid('The final booking total is outside the supported range.')
        let client
        if (row.clientId) {
          client = (await tx.get(db.collection('clients').doc(row.clientId))).data()
          if (!client) invalid('That client was not found.')
        } else {
          const clients = records(await tx.get(db.collection('clients')))
          client = clients.find(c=>normalPhone(c.phone)===normalPhone(row.phone) && c.name.toLowerCase()===row.name.toLowerCase())
        }
        if (client) {
          row.clientId = client.id
          row.name = client.name
          row.phone = client.phone
          row.email = client.email
          row.address = client.address || ''
          if (bookings.some(other=>other.collection===collection && other.id!==recordId && active(other) && active(row) && other.date===row.date && other.start===row.start && other.category===row.category && (other.clientId===client.id || normalPhone(other.phone)===normalPhone(client.phone)))) invalid('A matching booking already exists for this client and start time.')
        } else {
          const clientRef = db.collection('clients').doc()
          row.clientId = clientRef.id
          stage(clientRef,{name:row.name,phone:row.phone,email:row.email,address:row.address || '',status:'Active'})
        }
      }
      const outstanding = row.amount - sum(ledger,'amount')
      const received = row.settleBalance ? outstanding : old ? 0 : row.advance
      if (outstanding < 0 || received > outstanding) invalid('Payments cannot exceed the booking amount.')
      if (received > 0) {
        const paymentRef = row.settleBalance
          ? db.collection('payments').doc()
          : db.collection('payments').doc(collection+'-'+recordId+'-advance')
        stage(paymentRef,{
          bookingId:recordId,source:collection,amount:received,date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date()),method:row.method,notes:row.settleBalance?'Booking paid in full':'Booking advance'
        })
      }
      if (collection==='exposing_jobs') {
        for (const [field,name,category] of [['travel','Exposing travel','Travel'],['other','Exposing additional expenses','Other Expenses']]) {
          const expenseRef = db.collection('expenses').doc(recordId+'-'+field)
          const previousExpense = (await tx.get(expenseRef)).data()
          if (previousExpense?.paid && previousExpense.amount!==row[field]) invalid('Mark the linked expense as unpaid before changing its amount.')
          if (row[field] || previousExpense) stage(expenseRef,{name,category,amount:row[field],date:previousExpense?.date || row.date,paid:previousExpense?.paid ?? false,bookingId:recordId,source:collection,generated:true,status:row[field]?'Recorded':'Voided'},previousExpense)
        }
      }
      delete row.advance
      delete row.method
      delete row.settleBalance
      delete row.packageId
    }
    if (collection==='payments' || collection==='team_payments') {
      if (old) invalid('Recorded payments are immutable.')
      const booking = (await tx.get(db.collection(row.source).doc(row.bookingId))).data()
      if (!booking) invalid('Choose an existing booking.')
      const ledger = records(await tx.get(byBooking(collection,row.bookingId))).filter(p=>p.source===row.source)
      if (collection==='payments' && sum(ledger,'amount')+row.amount>booking.amount) invalid('Payment exceeds the outstanding booking balance.')
      if (collection==='team_payments') {
        const assignment = booking.assignments.find(a=>a.id===row.memberId)
        if (!assignment || sum(ledger.filter(p=>p.memberId===row.memberId),'amount')+row.amount>assignment.fee) invalid('Payment exceeds the outstanding assignment fee.')
      }
    }
    if (collection==='expenses') {
      if (old?.generated && (row.amount!==old.amount || row.bookingId!==old.bookingId || row.source!==old.source || row.category!==old.category)) invalid('Edit this amount on the exposing booking.')
      if (old?.generated) {
        row.generated = true
        row.status = old.status
      }
      if (row.bookingId) {
        if (!row.source || !(await tx.get(db.collection(row.source).doc(row.bookingId))).exists) invalid('Choose an existing booking.')
      } else delete row.source
    }
    if (collection==='settings' || collection==='services') {
      const named = records(await tx.get(db.collection(collection).where('name','==',row.name)))
      if (named.some(item=>item.id!==recordId)) invalid('A record with this name already exists.')
    }
    if (collection==='team_members' && row.photoPath && !new RegExp('^team/'+request.auth.uid+'/[a-zA-Z0-9_-]+$').test(row.photoPath)) invalid('Invalid profile photo path.')
    stage(ref,row,old)
    stage(audit,{recordId,collection,action:old?'Updated':'Created',actor:request.auth.uid})
    for (const [target,value] of writes) tx.set(target,value)
    tx.set(lock,{updatedAt:now})
    return {id:recordId}
  })
})

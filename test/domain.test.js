import test from 'node:test'
import assert from 'node:assert/strict'
import {bookingConflict,bookingAmount,overlaps,remaining,toPaise} from '../functions/domain.js'

test('a booking can override the catalog price or set a price without a package',()=>{
  const packageSnapshot={price:500000}
  assert.equal(bookingAmount({packageSnapshot,packagePrice:350000,charges:1000}),351000)
  assert.equal(bookingAmount({packageSnapshot,packagePrice:0}),0)
  assert.equal(bookingAmount({packagePrice:350000}),350000)
  assert.equal(bookingAmount({packageSnapshot}),500000)
})

test('paise conversion is precise and rejects excess precision and negative input',()=>{
  assert.equal(toPaise('1000000000.09'),100000000009)
  assert.equal(toPaise('0.1')+toPaise('0.2'),30)
  assert.throws(()=>toPaise('1.999'))
  assert.throws(()=>toPaise('-1'))
})
test('package services and advances are counted once',()=>{
  const amount=bookingAmount({packageSnapshot:{price:500000},services:[{price:200000,included:true},{price:100000,included:false}],charges:3000,discount:1000})
  assert.equal(amount,602000)
  assert.equal(remaining({id:'booking',amount},[{bookingId:'booking',amount:102000},{bookingId:'another',amount:500000}]),500000)
})
test('overlap requires a shared person, ignores cancelled jobs, and permits back-to-back assignments',()=>{
  const booking={date:'2026-11-23',start:'10:00',end:'12:00',status:'Confirmed',collection:'events',assignments:[{id:'one'}]}
  const job={...booking,start:'11:00',end:'13:00',collection:'exposing_jobs'}
  assert.equal(bookingConflict(booking,job),true)
  assert.equal(bookingConflict(booking,{...job,assignments:[{id:'two'}]}),false)
  assert.equal(overlaps(booking,{...job,start:'12:00'}),false)
  assert.equal(bookingConflict(booking,{...job,status:'Cancelled'}),false)
})
test('multiple exposing role calendars share the same studio contact conflict check',()=>{
  const job={date:'2026-11-23',start:'10:00',end:'12:00',status:'Confirmed',collection:'exposing_jobs'}
  assert.equal(bookingConflict({...job,phone:'+91 98765 43210'},{...job,phone:'9876543210',roles:['Candid Photography']}),true)
  assert.equal(bookingConflict({...job,phone:'9876543210'},{...job,phone:'8765432109'}),false)
})

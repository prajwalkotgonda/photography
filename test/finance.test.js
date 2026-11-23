import test from 'node:test'
import assert from 'node:assert/strict'
import {financials} from '../src/model.js'

test('booking value, collections, recorded expenses and cash profit use their own dates',()=>{
  const data={
    events:[{id:'wedding',date:'2026-11-23',collection:'events',status:'Confirmed',amount:100000}],
    exposing_jobs:[{id:'job',date:'2026-11-23',collection:'exposing_jobs',status:'Cancelled',amount:50000}],
    payments:[
      {bookingId:'wedding',source:'events',date:'2026-10-23',amount:30000},
      {bookingId:'wedding',source:'events',date:'2026-11-23',amount:20000}
    ],
    expenses:[
      {date:'2026-11-23',amount:10000,paid:true},
      {date:'2026-11-23',amount:5000,paid:false},
      {date:'2026-11-23',amount:3000,paid:false,status:'Voided'}
    ],
    team_payments:[{date:'2026-11-23',amount:2000,source:'events'}]
  }
  const range={from:'2026-11-01',to:'2026-11-30'}
  const result=financials(data,range)
  assert.equal(result.value,100000)
  assert.equal(result.revenue,20000)
  assert.equal(result.pending,50000)
  assert.equal(result.cost,17000)
  assert.equal(result.estimated,83000)
  assert.equal(result.cash,8000)
  assert.equal(financials(data,range,'exposing_jobs').value,0)
})

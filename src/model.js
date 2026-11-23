import {format,startOfWeek,endOfWeek,startOfMonth,endOfMonth,startOfYear,endOfYear} from 'date-fns'
import {sum,active} from '../functions/domain.js'
export const currency = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((value || 0)/100)
export const iso = date => format(date,'yyyy-MM-dd')
export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date())
export const dateLabel = date => date ? format(new Date(date+'T12:00:00'),'dd MMM yyyy') : '—'
export const rupees = amount => String((amount || 0)/100)
export const bookings = data => [...data.events,...data.exposing_jobs]
export const byDate = (a,b) => (a.date+a.start).localeCompare(b.date+b.start)
export const recent = (a,b) => (b.createdAt?.seconds || 0)-(a.createdAt?.seconds || 0)
export const sourceLabel = collection => collection==='events'?'Wedding':'Exposing'
export const inRange = (date,range) => (!range.from || date>=range.from) && (!range.to || date<=range.to)
export function presets(name) {
  const now = new Date(today()+'T12:00:00')
  if (name==='Today') return {from:today(),to:today()}
  if (name==='This Week') return {from:iso(startOfWeek(now,{weekStartsOn:1})),to:iso(endOfWeek(now,{weekStartsOn:1}))}
  if (name==='This Month') return {from:iso(startOfMonth(now)),to:iso(endOfMonth(now))}
  if (name==='This Year') return {from:iso(startOfYear(now)),to:iso(endOfYear(now))}
  return {from:'',to:''}
}
export function financials(data,range,source) {
  const matching = row => !source || (row.source || row.collection)===source
  const events = bookings(data).filter(row=>active(row) && matching(row) && inRange(row.date,range))
  const payments = data.payments.filter(row=>matching(row) && inRange(row.date,range))
  const team = data.team_payments.filter(row=>matching(row) && inRange(row.date,range))
  const expenses = data.expenses.filter(row=>row.status!=='Voided' && matching(row) && inRange(row.date,range))
  const value = sum(events,'amount')
  const revenue = sum(payments,'amount')
  const teamPaid = sum(team,'amount')
  const cost = sum(expenses,'amount')+teamPaid
  const pending = events.reduce((amount,row)=>amount+row.amount-sum(data.payments.filter(p=>p.bookingId===row.id && p.source===row.collection),'amount'),0)
  return {events,payments,team,expenses,value,revenue,teamPaid,cost,pending,estimated:value-cost,cash:revenue-sum(expenses.filter(row=>row.paid),'amount')-teamPaid}
}

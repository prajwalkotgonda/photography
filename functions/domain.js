export const categories = ['Wedding','Engagement','Pre-Wedding','Post-Wedding','Haldi','Mehendi','Baby Shower','Birthday','Maternity Shoot','Other Events']
export const services = ['Drone Photography','Cinematic Video','Cinematic Photography','Traditional Video','Traditional Photography','Candid Photography','Wedding Album','Additional Services']
export const exposingRoles = ['Candid Photography','Cinematic Photography','Cinematic Videography','Traditional Photography / Videography']
export const teamRoles = ['Candid Photographer','Cinematic Photographer','Cinematic Videographer','Traditional Photographer','Traditional Videographer','Drone Operator','Album Designer','Video Editor']
export const statuses = ['Enquiry','Confirmed','In Progress','Completed','Cancelled']
export const methods = ['Cash','UPI','Bank Transfer','Other']
export const expenseCategories = ['Team Payments','Travel','Album Printing','Equipment Rental','Camera Rental','Food and Accommodation','Other Expenses']
export const bookingCollections = ['events','exposing_jobs']
export const active = row => row.status !== 'Cancelled'
export const overlaps = (a,b) => active(a) && active(b) && a.date === b.date && a.start < b.end && b.start < a.end
export const people = row => (row.assignments || []).map(person => person.id)
export const sharedPeople = (a,b) => people(a).some(id => people(b).includes(id))
export const sum = (rows, field) => rows.reduce((total,row) => total + (row[field] || 0),0)
export const paidFor = (payments, id) => sum(payments.filter(p => p.bookingId === id),'amount')
export const remaining = (row,payments) => row.amount - paidFor(payments,row.id)
export const paymentStatus = (row,payments) => remaining(row,payments) === 0 ? 'Paid' : paidFor(payments,row.id) ? 'Part paid' : 'Pending'
export const bookingAmount = row => (row.packageSnapshot?.price || 0) +
  sum((row.services || []).filter(service => !service.included),'price') + (row.charges || 0) - (row.discount || 0)
export function toPaise(input) {
  const value = String(input ?? '').trim()
  if (!value) return 0
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive rupee amount with up to two decimal places.')
  const [whole,fraction=''] = value.split('.')
  return Number(whole)*100 + Number(fraction.padEnd(2,'0'))
}
export function bookingConflict(a,b) {
  if (!overlaps(a,b)) return false
  if (sharedPeople(a,b)) return true
  if (a.collection === 'exposing_jobs' && b.collection === 'exposing_jobs') {
    return Boolean(a.phone && a.phone.replace(/\D/g,'').slice(-10) === b.phone?.replace(/\D/g,'').slice(-10))
  }
  return false
}

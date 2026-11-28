import {initializeApp} from 'firebase/app'
import {getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator} from 'firebase/auth'
import {getFirestore, collection, doc, setDoc, getDoc, serverTimestamp, onSnapshot, connectFirestoreEmulator} from 'firebase/firestore'
import {getFunctions, httpsCallable, connectFunctionsEmulator} from 'firebase/functions'
import {getStorage, ref, uploadBytes, getBlob, connectStorageEmulator} from 'firebase/storage'
const studioConfig = {
  apiKey:'AIzaSyBjoZVjIbdUzASVx-roE-uN9EiJ5eCXHWQ',
  authDomain:'photography-498b3.firebaseapp.com',
  projectId:'photography-498b3',
  storageBucket:'photography-498b3.firebasestorage.app',
  messagingSenderId:'1078949958214',
  appId:'1:1078949958214:web:4ca726458113906e8c3047',
  measurementId:'G-7E1HFKB8HV'
}
const environmentConfig = {
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY, authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId:import.meta.env.VITE_FIREBASE_APP_ID
}
// A clean deployment uses this studio's public Firebase Web App configuration.
// If a deployment opts into environment overrides, require a complete set.
const config = Object.values(environmentConfig).some(Boolean) ? environmentConfig : studioConfig
export const configured = Object.values(config).every(Boolean)
const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || config.measurementId
const app = configured ? initializeApp({...config, ...(measurementId && {measurementId})}) : null
if (app && import.meta.env.PROD && measurementId) {
  void import('firebase/analytics').then(async ({getAnalytics, isSupported})=>{
    if (await isSupported()) getAnalytics(app)
  }).catch(error=>console.warn('Firebase Analytics could not initialize.',error))
}
export const auth = app && getAuth(app)
export const db = app && getFirestore(app)
const storage = app && getStorage(app)
const functions = app && getFunctions(app,import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1')
if (app && import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS==='true') {
  connectAuthEmulator(auth,'http://127.0.0.1:9099')
  connectFirestoreEmulator(db,'127.0.0.1',8080)
  connectFunctionsEmulator(functions,'127.0.0.1',5001)
  connectStorageEmulator(storage,'127.0.0.1',9199)
}
export const persistence = () => setPersistence(auth,browserLocalPersistence)
export const subscribe = (name,next,error) => onSnapshot(collection(db,name),snapshot=>next(snapshot.docs.map(doc=>({...doc.data(),id:doc.id}))),error)

export async function directSave(colName, id, requestId, data) {
  if (!db) throw new Error('Database is not initialized.')
  const now = serverTimestamp()
  const docRef = doc(db, colName, id)
  const previousSnap = await getDoc(docRef)
  const prior = previousSnap.exists() ? previousSnap.data() : null

  if (colName === 'events') {
    let packageSnapshot = prior?.packageSnapshot || null
    if (data.packageId) {
      if (prior?.packageSnapshot?.id === data.packageId) {
        packageSnapshot = prior.packageSnapshot
      } else {
        const packSnap = await getDoc(doc(db, 'packages', data.packageId))
        if (packSnap.exists()) {
          const packData = packSnap.data()
          const { createdAt, updatedAt, ...cleanPack } = packData
          packageSnapshot = cleanPack
        }
      }
    }

    const packagePrice = data.packagePrice !== undefined ? data.packagePrice : (packageSnapshot?.price ?? 0)
    const servicesTotal = (data.services || []).filter(s => !s.included).reduce((total, s) => total + (s.price || 0), 0)
    const amount = packagePrice + servicesTotal + (data.charges || 0) - (data.discount || 0)

    let clientId = data.clientId
    if (!clientId && data.name) {
      const clientRef = doc(collection(db, 'clients'))
      clientId = clientRef.id
      await setDoc(clientRef, {
        id: clientId,
        name: data.name,
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        status: 'Active',
        createdAt: now,
        updatedAt: now
      })
    }

    const advance = data.advance || 0
    const settleBalance = Boolean(data.settleBalance)
    const paymentAmount = settleBalance ? amount : (prior ? 0 : advance)
    if (paymentAmount > 0) {
      const paymentRef = settleBalance
        ? doc(collection(db, 'payments'))
        : doc(db, 'payments', `events-${id}-advance`)
      await setDoc(paymentRef, {
        id: paymentRef.id,
        bookingId: id,
        source: 'events',
        amount: paymentAmount,
        date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(new Date()),
        method: data.method || 'Cash',
        notes: settleBalance ? 'Booking paid in full' : 'Booking advance',
        createdAt: now,
        updatedAt: now
      }, { merge: true })
    }

    const { advance: _adv, method: _m, settleBalance: _sb, packageId: _pid, ...eventPayload } = data
    eventPayload.amount = amount
    if (clientId) eventPayload.clientId = clientId
    if (packageSnapshot) eventPayload.packageSnapshot = packageSnapshot

    await setDoc(docRef, {
      ...eventPayload,
      id,
      collection: 'events',
      status: data.status || 'Confirmed',
      createdAt: prior?.createdAt || now,
      updatedAt: now
    }, { merge: true })
  } else if (colName === 'exposing_jobs') {
    const advance = data.advance || 0
    const settleBalance = Boolean(data.settleBalance)
    const paymentAmount = settleBalance ? (data.amount || 0) : (prior ? 0 : advance)
    if (paymentAmount > 0) {
      const paymentRef = settleBalance
        ? doc(collection(db, 'payments'))
        : doc(db, 'payments', `exposing_jobs-${id}-advance`)
      await setDoc(paymentRef, {
        id: paymentRef.id,
        bookingId: id,
        source: 'exposing_jobs',
        amount: paymentAmount,
        date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(new Date()),
        method: data.method || 'Cash',
        notes: settleBalance ? 'Booking paid in full' : 'Booking advance',
        createdAt: now,
        updatedAt: now
      }, { merge: true })
    }

    if (data.travel) {
      const expRef = doc(db, 'expenses', `${id}-travel`)
      await setDoc(expRef, {
        id: `${id}-travel`,
        name: 'Exposing travel',
        category: 'Travel',
        amount: data.travel,
        date: data.date,
        paid: false,
        bookingId: id,
        source: 'exposing_jobs',
        generated: true,
        status: 'Recorded',
        createdAt: now,
        updatedAt: now
      }, { merge: true })
    }

    if (data.other) {
      const expRef = doc(db, 'expenses', `${id}-other`)
      await setDoc(expRef, {
        id: `${id}-other`,
        name: 'Exposing additional expenses',
        category: 'Other Expenses',
        amount: data.other,
        date: data.date,
        paid: false,
        bookingId: id,
        source: 'exposing_jobs',
        generated: true,
        status: 'Recorded',
        createdAt: now,
        updatedAt: now
      }, { merge: true })
    }

    const { advance: _adv, method: _m, settleBalance: _sb, ...jobPayload } = data
    await setDoc(docRef, {
      ...jobPayload,
      id,
      collection: 'exposing_jobs',
      status: data.status || 'Confirmed',
      createdAt: prior?.createdAt || now,
      updatedAt: now
    }, { merge: true })
  } else {
    await setDoc(docRef, {
      ...data,
      id,
      createdAt: prior?.createdAt || now,
      updatedAt: now
    }, { merge: true })
  }

  if (requestId) {
    try {
      await setDoc(doc(db, 'audit_logs', requestId), {
        id: requestId,
        recordId: id,
        collection: colName,
        action: prior ? 'Updated' : 'Created',
        actor: auth?.currentUser?.uid || 'admin',
        createdAt: now
      })
    } catch {
      // Non-fatal
    }
  }

  return { id }
}

export async function save(collection, id, requestId, data) {
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true' && functions) {
    try {
      return await httpsCallable(functions, 'saveRecord')({ collection, id, requestId, data })
    } catch (err) {
      console.warn('Functions emulator error, falling back to direct save:', err)
    }
  }

  try {
    return await directSave(collection, id, requestId, data)
  } catch (directErr) {
    if (functions) {
      try {
        return await httpsCallable(functions, 'saveRecord')({ collection, id, requestId, data })
      } catch {
        throw directErr
      }
    }
    throw directErr
  }
}

export async function uploadPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>=5242880) throw new Error('Choose a JPEG, PNG or WebP image under 5 MB.')
  const path = 'team/'+auth.currentUser.uid+'/'+crypto.randomUUID()
  await uploadBytes(ref(storage,path),file)
  return path
}
export const loadPhoto = path => getBlob(ref(storage,path))

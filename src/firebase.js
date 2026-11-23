import {initializeApp} from 'firebase/app'
import {getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator} from 'firebase/auth'
import {getFirestore, collection, onSnapshot, connectFirestoreEmulator} from 'firebase/firestore'
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
export const save = (collection,id,requestId,data) => httpsCallable(functions,'saveRecord')({collection,id,requestId,data})
export async function uploadPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>=5242880) throw new Error('Choose a JPEG, PNG or WebP image under 5 MB.')
  const path = 'team/'+auth.currentUser.uid+'/'+crypto.randomUUID()
  await uploadBytes(ref(storage,path),file)
  return path
}
export const loadPhoto = path => getBlob(ref(storage,path))

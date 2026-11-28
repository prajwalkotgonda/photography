import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {Toaster} from 'react-hot-toast'
import {App} from './App'
import './styles.css'
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App/>
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#064e3b',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '15px',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#ffffff',
          },
        },
      }}
    />
  </BrowserRouter>
)

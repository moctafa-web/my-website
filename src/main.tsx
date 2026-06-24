import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './auth'

// ✅ نظام الإصدار: لما تغير الرقم، الكاش يتمسح في كل الأجهزة تلقائياً
const APP_VERSION = '2.0.0'
const savedVersion = localStorage.getItem('app_version')

if (savedVersion !== APP_VERSION) {
  console.log('🧹 مسح الكاش القديم وتحديث للنسخة:', APP_VERSION)
  localStorage.clear()
  localStorage.setItem('app_version', APP_VERSION)
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
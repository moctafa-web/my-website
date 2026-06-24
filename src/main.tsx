import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './auth'

// ⚠️ مؤقت: يمسح البيانات القديمة من كل المتصفحات
// بعد ما تتأكد إن كل حاجة شغالة، احذف السطر ده
localStorage.clear()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
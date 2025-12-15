import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

import { ApiProvider } from './context/ApiContext'

console.log('Frontend starting...');
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ApiProvider>
            <App />
        </ApiProvider>
    </StrictMode>,
)

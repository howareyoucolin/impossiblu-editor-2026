import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
    return (
        <main className="app-shell">
            <h1>Hello Dog!!!</h1>
        </main>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)

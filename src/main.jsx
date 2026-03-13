import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
    const [files, setFiles] = useState([])
    const [selectedFile, setSelectedFile] = useState('')
    const [content, setContent] = useState('')
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [isDirty, setIsDirty] = useState(false)
    const [isLocked, setIsLocked] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function loadFiles() {
            try {
                const nextFiles = await window.localFiles.list()

                if (cancelled) {
                    return
                }

                setFiles(nextFiles)
                setError('')
                setStatus('')

                if (nextFiles.length > 0) {
                    setSelectedFile(nextFiles[0])
                } else {
                    setSelectedFile('')
                    setContent('')
                    setIsLocked(true)
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError('Failed to load files.')
                }
            }
        }

        loadFiles()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        async function loadContent() {
            if (!selectedFile) {
                setContent('')
                return
            }

            try {
                const nextContent = await window.localFiles.read(selectedFile)

                if (!cancelled) {
                    setContent(nextContent)
                    setError('')
                    setStatus('')
                    setIsDirty(false)
                    setIsLocked(true)
                }
            } catch (loadError) {
                if (!cancelled) {
                    setContent('')
                    setError(`Failed to read ${selectedFile}.`)
                    setStatus('')
                    setIsDirty(false)
                    setIsLocked(true)
                }
            }
        }

        loadContent()

        return () => {
            cancelled = true
        }
    }, [selectedFile])

    async function handleSave() {
        if (!selectedFile) {
            return
        }

        try {
            await window.localFiles.write(selectedFile, content)
            setStatus('Saved')
            setError('')
            setIsDirty(false)
            setIsLocked(true)
        } catch (saveError) {
            setStatus('')
            setError(`Failed to save ${selectedFile}.`)
        }
    }

    return (
        <main className="app-shell">
            <aside className="sidebar">
                <h1>Files</h1>
                <div className="file-list">
                    {files.map((fileName) => (
                        <button
                            key={fileName}
                            className={
                                fileName === selectedFile
                                    ? 'file-button is-active'
                                    : 'file-button'
                            }
                            onClick={() => setSelectedFile(fileName)}
                            type="button"
                        >
                            {fileName}
                        </button>
                    ))}
                </div>
            </aside>
            <section className="content-panel">
                <header className="content-header">
                    <div>
                        <h2>{selectedFile || 'No file selected'}</h2>
                        <p className="content-status">
                            {error ||
                                status ||
                                (isLocked
                                    ? 'Locked'
                                    : isDirty
                                      ? 'Unsaved changes'
                                      : 'Unlocked')}
                        </p>
                    </div>
                    <div className="action-row">
                        <button
                            className={
                                isLocked ? 'lock-button is-locked' : 'lock-button'
                            }
                            disabled={!selectedFile}
                            onClick={() => setIsLocked((current) => !current)}
                            type="button"
                        >
                            {isLocked ? 'Unlock' : 'Lock'}
                        </button>
                        <button
                            className="save-button"
                            disabled={!selectedFile || isLocked || !isDirty}
                            onClick={handleSave}
                            type="button"
                        >
                            Save
                        </button>
                    </div>
                </header>
                {selectedFile ? (
                    <textarea
                        className="content-editor"
                        readOnly={isLocked}
                        onChange={(event) => {
                            setContent(event.target.value)
                            setIsDirty(true)
                            setStatus('')
                            if (error) {
                                setError('')
                            }
                        }}
                        spellCheck={false}
                        value={content}
                    />
                ) : (
                    <p className="message">No files found in local-data.</p>
                )}
            </section>
        </main>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)

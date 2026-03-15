import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ContentPanel } from './components/ContentPanel'
import { Sidebar } from './components/Sidebar'
import { Setup } from './components/Setup'
import './styles.css'

function getNextSelectedFile(fileNames, removedFile) {
    return fileNames.find((fileName) => fileName !== removedFile) || ''
}

function getDefaultEditorState() {
    return {
        content: '',
        error: '',
        isDirty: false,
        isLoaded: false,
        isLocked: true,
        status: '',
    }
}

function getNextOpenTab(tabFiles, removedFile) {
    return tabFiles.find((fileName) => fileName !== removedFile) || ''
}

function getNextUntitledFileName(fileNames) {
    const baseName = 'untitled'
    const extension = '.txt'
    const firstChoice = `${baseName}${extension}`

    if (!fileNames.includes(firstChoice)) {
        return firstChoice
    }

    let index = 2

    while (fileNames.includes(`${baseName}-${index}${extension}`)) {
        index += 1
    }

    return `${baseName}-${index}${extension}`
}

function buildCombinedOpenTabsContent(openTabs, editorStates) {
    return openTabs
        .map((fileName) => {
            const fileContent = editorStates[fileName]?.content || ''
            return `===== ${fileName} =====\n${fileContent}`
        })
        .join('\n\n')
}

async function searchAcrossFiles(query) {
    if (query.trim() === '') {
        return []
    }

    return window.localFiles.search(query)
}

function App() {
    const historyPageSize = 30
    const [files, setFiles] = useState([])
    const [activeFile, setActiveFile] = useState('')
    const [openTabs, setOpenTabs] = useState([])
    const [editorStates, setEditorStates] = useState({})
    const [copyBubble, setCopyBubble] = useState(null)
    const [deleteUnlockedFile, setDeleteUnlockedFile] = useState('')
    const [editingFileName, setEditingFileName] = useState('')
    const [isDataDirectoryReady, setIsDataDirectoryReady] = useState(null)
    const [isSettingUp, setIsSettingUp] = useState(false)
    const [renameDraft, setRenameDraft] = useState('')
    const [setupError, setSetupError] = useState('')
    const [isSidebarSearchOpen, setIsSidebarSearchOpen] = useState(false)
    const [isSidebarSearchLoading, setIsSidebarSearchLoading] = useState(false)
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
    const [sidebarSearchResults, setSidebarSearchResults] = useState([])
    const [contentSearchJump, setContentSearchJump] = useState(null)
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [isUsageLookupOpen, setIsUsageLookupOpen] = useState(false)
    const [historyMessages, setHistoryMessages] = useState([])
    const [historyError, setHistoryError] = useState('')
    const [historyActionError, setHistoryActionError] = useState('')
    const [historyPage, setHistoryPage] = useState(1)
    const [historyTotal, setHistoryTotal] = useState(0)

    const activeState = activeFile
        ? editorStates[activeFile] || getDefaultEditorState()
        : getDefaultEditorState()
    const combinedOpenTabsContent = buildCombinedOpenTabsContent(openTabs, editorStates)

    async function refreshSidebarSearch(query = sidebarSearchQuery) {
        if (!isSidebarSearchOpen || query.trim() === '') {
            setSidebarSearchResults([])
            setIsSidebarSearchLoading(false)
            return
        }

        setIsSidebarSearchLoading(true)

        try {
            const nextResults = await searchAcrossFiles(query)
            setSidebarSearchResults(nextResults)
        } catch (error) {
            setSidebarSearchResults([])
        } finally {
            setIsSidebarSearchLoading(false)
        }
    }

    async function loadHistoryPage(page) {
        try {
            const historyResult = await window.localFiles.history(page, historyPageSize)

            if (Array.isArray(historyResult)) {
                setHistoryMessages(historyResult)
                setHistoryTotal(historyResult.length)
            } else {
                setHistoryMessages(historyResult.messages || [])
                setHistoryTotal(historyResult.total || 0)
            }

            setHistoryError('')
        } catch (error) {
            setHistoryMessages([])
            setHistoryTotal(0)
            setHistoryError('Failed to load commit history.')
        }
    }

    async function openHistoryModal() {
        const firstPage = 1
        setHistoryPage(firstPage)
        await loadHistoryPage(firstPage)
        setIsHistoryOpen(true)
    }

    async function handleHistoryPageChange(nextPage) {
        setHistoryPage(nextPage)
        await loadHistoryPage(nextPage)
    }

    async function handleOpenHistoryTerminal() {
        try {
            await window.localFiles.openTerminal()
            setHistoryActionError('')
        } catch (error) {
            setHistoryActionError('Failed to open Terminal for local-data.')
        }
    }

    function openFile(fileName) {
        if (activeFile && activeFile !== fileName) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    isLocked: true,
                },
            }))
        }

        setActiveFile(fileName)
        setOpenTabs((currentTabs) =>
            currentTabs.includes(fileName) ? currentTabs : [...currentTabs, fileName]
        )
    }

    useEffect(() => {
        let cancelled = false

        async function checkDataDirectory() {
            try {
                const exists = await window.localFiles.exists()

                if (!cancelled) {
                    setIsDataDirectoryReady(exists)
                }
            } catch (error) {
                if (!cancelled) {
                    setIsDataDirectoryReady(false)
                    setSetupError('Failed to check local-data.')
                }
            }
        }

        checkDataDirectory()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!isDataDirectoryReady) {
            return undefined
        }

        let cancelled = false

        async function loadFiles() {
            try {
                const nextFiles = await window.localFiles.list()

                if (cancelled) {
                    return
                }

                setFiles(nextFiles)

                if (nextFiles.length > 0) {
                    openFile(nextFiles[0])
                } else {
                    setActiveFile('')
                    setOpenTabs([])
                    setEditorStates({})
                    setCopyBubble(null)
                    setDeleteUnlockedFile('')
                    setEditingFileName('')
                    setIsSidebarSearchOpen(false)
                    setRenameDraft('')
                    setSidebarSearchQuery('')
                }
            } catch (loadError) {
                if (!cancelled) {
                    setEditorStates((currentStates) => ({
                        ...currentStates,
                        [activeFile]: {
                            ...(currentStates[activeFile] || getDefaultEditorState()),
                            error: 'Failed to load files.',
                            status: '',
                        },
                    }))
                }
            }
        }

        loadFiles()

        return () => {
            cancelled = true
        }
    }, [isDataDirectoryReady])

    useEffect(() => {
        let cancelled = false

        async function loadContent() {
            if (!activeFile) {
                return
            }

            const currentState = editorStates[activeFile]

            if (currentState?.isLoaded) {
                return
            }

            try {
                const nextContent = await window.localFiles.read(activeFile)

                if (!cancelled) {
                    setEditorStates((currentStates) => ({
                        ...currentStates,
                        [activeFile]: {
                            content: nextContent,
                            error: '',
                            isDirty: false,
                            isLoaded: true,
                            isLocked: true,
                            status: '',
                        },
                    }))
                    setDeleteUnlockedFile('')
                    setEditingFileName('')
                    setCopyBubble(null)
                    setRenameDraft('')
                }
            } catch (loadError) {
                if (!cancelled) {
                    setEditorStates((currentStates) => ({
                        ...currentStates,
                        [activeFile]: {
                            ...(currentStates[activeFile] || getDefaultEditorState()),
                            content: '',
                            error: `Failed to read ${activeFile}.`,
                            isDirty: false,
                            isLoaded: true,
                            isLocked: true,
                            status: '',
                        },
                    }))
                    setDeleteUnlockedFile('')
                    setEditingFileName('')
                    setCopyBubble(null)
                    setRenameDraft('')
                }
            }
        }

        loadContent()

        return () => {
            cancelled = true
        }
    }, [activeFile, editorStates])

    useEffect(() => {
        if (!isSidebarSearchOpen) {
            setSidebarSearchResults([])
            setIsSidebarSearchLoading(false)
            return undefined
        }

        if (sidebarSearchQuery.trim() === '') {
            setSidebarSearchResults([])
            setIsSidebarSearchLoading(false)
            return undefined
        }

        let cancelled = false

        async function loadSidebarSearchResults() {
            setIsSidebarSearchLoading(true)

            try {
                const nextResults = await searchAcrossFiles(sidebarSearchQuery)

                if (!cancelled) {
                    setSidebarSearchResults(nextResults)
                }
            } catch (error) {
                if (!cancelled) {
                    setSidebarSearchResults([])
                }
            } finally {
                if (!cancelled) {
                    setIsSidebarSearchLoading(false)
                }
            }
        }

        loadSidebarSearchResults()

        return () => {
            cancelled = true
        }
    }, [isSidebarSearchOpen, sidebarSearchQuery])

    async function handleSaveTab(fileName) {
        const nextState = editorStates[fileName] || getDefaultEditorState()

        if (!nextState.isDirty) {
            return
        }

        try {
            await window.localFiles.write(fileName, nextState.content)
            setEditorStates((currentStates) => ({
                ...currentStates,
                [fileName]: {
                    ...(currentStates[fileName] || getDefaultEditorState()),
                    error: '',
                    isDirty: false,
                    isLocked: true,
                    status: 'Saved',
                },
            }))
            await refreshSidebarSearch()
        } catch (saveError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [fileName]: {
                    ...(currentStates[fileName] || getDefaultEditorState()),
                    error: `Failed to save ${fileName}.`,
                    status: '',
                },
            }))
        }
    }

    async function refreshFiles(nextSelectedFile = activeFile) {
        const nextFiles = await window.localFiles.list()
        setFiles(nextFiles)

        if (nextSelectedFile && nextFiles.includes(nextSelectedFile)) {
            openFile(nextSelectedFile)
            return
        }

        if (nextFiles[0]) {
            openFile(nextFiles[0])
            return
        }

        setActiveFile('')
        setOpenTabs([])
    }

    async function handleCreateFile() {
        const fileName = getNextUntitledFileName(files)

        try {
            await window.localFiles.create(fileName)
            setDeleteUnlockedFile('')
            setEditingFileName('')
            setCopyBubble(null)
            setIsSidebarSearchOpen(false)
            setRenameDraft('')
            setSidebarSearchQuery('')
            setEditorStates((currentStates) => ({
                ...currentStates,
                [fileName]: {
                    ...getDefaultEditorState(),
                    isLoaded: true,
                    status: `Created ${fileName}`,
                },
            }))
            await refreshSidebarSearch()
            await refreshFiles(fileName)
        } catch (createError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: createError.message || 'Failed to create file.',
                    status: '',
                },
            }))
        }
    }

    async function handleDeleteFile(fileName) {
        if (deleteUnlockedFile !== fileName) {
            return
        }

        const shouldDelete = window.confirm(`Delete ${fileName}?`)

        if (!shouldDelete) {
            return
        }

        try {
            await window.localFiles.delete(fileName)
            setDeleteUnlockedFile('')
            setEditingFileName('')
            setCopyBubble(null)
            setIsSidebarSearchOpen(false)
            setRenameDraft('')
            setSidebarSearchQuery('')
            setEditorStates((currentStates) => {
                const nextStates = { ...currentStates }
                delete nextStates[fileName]
                return nextStates
            })
            setOpenTabs((currentTabs) =>
                currentTabs.filter((tabFileName) => tabFileName !== fileName)
            )
            setSidebarSearchResults((currentResults) =>
                currentResults.filter((result) => result.fileName !== fileName)
            )
            await refreshSidebarSearch()
            await refreshFiles(getNextSelectedFile(files, fileName))
        } catch (deleteError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: deleteError.message || `Failed to delete ${fileName}.`,
                    status: '',
                },
            }))
        }
    }

    async function handleRenameFile(oldFileName) {
        if (!oldFileName) {
            setEditingFileName('')
            setRenameDraft('')
            return
        }

        const nextFileName = renameDraft.trim()

        if (nextFileName === '' || nextFileName === oldFileName) {
            setEditingFileName('')
            setRenameDraft('')
            return
        }

        try {
            await window.localFiles.rename(oldFileName, nextFileName)

            setFiles((currentFiles) =>
                currentFiles
                    .map((fileName) =>
                        fileName === oldFileName ? nextFileName : fileName
                    )
                    .sort((a, b) => a.localeCompare(b))
            )
            setOpenTabs((currentTabs) =>
                currentTabs.map((fileName) =>
                    fileName === oldFileName ? nextFileName : fileName
                )
            )
            setEditorStates((currentStates) => {
                const nextStates = { ...currentStates }
                nextStates[nextFileName] =
                    nextStates[oldFileName] || getDefaultEditorState()
                delete nextStates[oldFileName]
                return nextStates
            })
            setSidebarSearchResults((currentResults) =>
                currentResults.map((result) =>
                    result.fileName === oldFileName
                        ? { ...result, fileName: nextFileName }
                        : result
                )
            )
            await refreshSidebarSearch()

            if (activeFile === oldFileName) {
                setActiveFile(nextFileName)
            }

            if (deleteUnlockedFile === oldFileName) {
                setDeleteUnlockedFile('')
            }

            setEditingFileName('')
            setRenameDraft('')
        } catch (renameError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: renameError.message || `Failed to rename ${oldFileName}.`,
                    status: '',
                },
            }))
        }
    }

    function handleCloseTab(fileName) {
        const nextTabs = openTabs.filter((tabFileName) => tabFileName !== fileName)
        setOpenTabs(nextTabs)

        if (activeFile === fileName) {
            setActiveFile(getNextOpenTab(nextTabs, ''))
        }
    }

    async function handleSetup() {
        setIsSettingUp(true)
        setSetupError('')

        try {
            await window.localFiles.setup()
            setIsDataDirectoryReady(true)
        } catch (error) {
            setSetupError(error.message || 'Failed to set up local-data.')
        } finally {
            setIsSettingUp(false)
        }
    }

    if (isDataDirectoryReady === null) {
        return null
    }

    if (!isDataDirectoryReady) {
        return (
            <Setup
                error={setupError}
                isSettingUp={isSettingUp}
                onSetup={handleSetup}
            />
        )
    }

    const historyTotalPages = Math.max(1, Math.ceil(historyTotal / historyPageSize))
    const historyStartIndex = (historyPage - 1) * historyPageSize

    return (
        <main className="app-shell">
            <Sidebar
                deleteUnlockedFile={deleteUnlockedFile}
                editingFileName={editingFileName}
                files={files}
                isHistoryOpen={isHistoryOpen}
                isUsageLookupOpen={isUsageLookupOpen}
                isSidebarSearchOpen={isSidebarSearchOpen}
                isSidebarSearchLoading={isSidebarSearchLoading}
                onChangeSidebarSearch={setSidebarSearchQuery}
                onOpenHistory={openHistoryModal}
                onOpenUsageLookup={() => setIsUsageLookupOpen(true)}
                copyBubble={copyBubble}
                onCopyOpenFiles={async (event) => {
                    await navigator.clipboard.writeText(combinedOpenTabsContent)
                    setCopyBubble({
                        label: `${openTabs.length} files copied`,
                        x: event.clientX + 10,
                        y: event.clientY - 36,
                    })
                    window.setTimeout(() => {
                        setCopyBubble(null)
                    }, 1200)
                }}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onSelectSearchResult={(result) => {
                    setContentSearchJump({
                        fileName: result.fileName,
                        id: `${result.fileName}:${result.lineNumber}:${result.matchStart}:${Date.now()}`,
                        matchEnd: result.matchEnd,
                        matchStart: result.matchStart,
                        query: sidebarSearchQuery,
                    })
                    openFile(result.fileName)
                }}
                onRenameCancel={() => {
                    setEditingFileName('')
                    setRenameDraft('')
                }}
                onRenameChange={setRenameDraft}
                onRenameCommit={handleRenameFile}
                onRenameStart={(fileName) => {
                    if (deleteUnlockedFile !== fileName) {
                        return
                    }

                    setEditingFileName(fileName)
                    setRenameDraft(fileName)
                }}
                onSelectFile={openFile}
                onToggleSidebarSearch={() => {
                    setIsSidebarSearchOpen((current) => !current)
                    setSidebarSearchQuery('')
                    setSidebarSearchResults([])
                }}
                onToggleDeleteLock={(fileName) =>
                    setDeleteUnlockedFile((current) =>
                        current === fileName ? '' : fileName
                    )
                }
                renameDraft={renameDraft}
                searchResults={sidebarSearchResults}
                sidebarSearchQuery={sidebarSearchQuery}
                selectedFile={activeFile}
            />
            {isUsageLookupOpen ? (
                <div className="history-modal-backdrop" role="presentation">
                    <div
                        aria-labelledby="usage-lookup-title"
                        aria-modal="true"
                        className="history-modal usage-modal"
                        role="dialog"
                    >
                        <div className="history-modal-header">
                            <h2 id="usage-lookup-title">Custom Tag Usage</h2>
                            <div className="history-modal-header-actions">
                                <button
                                    aria-label="Close tag usage"
                                    className="history-modal-close"
                                    onClick={() => setIsUsageLookupOpen(false)}
                                    type="button"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        <div className="usage-modal-list">
                            <div className="usage-modal-item">
                                <div className="usage-modal-tag">[copy=secret-text]</div>
                                <p className="usage-modal-description">
                                    Highlights `secret-text` in readonly mode. Click it
                                    to copy the value.
                                </p>
                            </div>
                            <div className="usage-modal-item">
                                <div className="usage-modal-tag">[pass=my-password]</div>
                                <p className="usage-modal-description">
                                    Shows masked text like `***********` in readonly mode.
                                    Click it to copy the real password.
                                </p>
                            </div>
                            <div className="usage-modal-item">
                                <div className="usage-modal-tag">[link=openai.com]</div>
                                <p className="usage-modal-description">
                                    Underlines `openai.com` in readonly mode. Click it
                                    to open a new tab in Chrome.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
            {isHistoryOpen ? (
                <div className="history-modal-backdrop" role="presentation">
                    <div
                        aria-labelledby="history-modal-title"
                        aria-modal="true"
                        className="history-modal"
                        role="dialog"
                    >
                        <div className="history-modal-header">
                            <h2 id="history-modal-title">Recent Commits</h2>
                            <div className="history-modal-header-actions">
                                <button
                                    aria-label="Open Terminal in local-data"
                                    className="history-modal-open-terminal"
                                    onClick={handleOpenHistoryTerminal}
                                    type="button"
                                >
                                    <i
                                        className="fa-solid fa-terminal"
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    aria-label="Close commit history"
                                    className="history-modal-close"
                                    onClick={() => {
                                        setHistoryActionError('')
                                        setIsHistoryOpen(false)
                                    }}
                                    type="button"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        {historyActionError ? (
                            <p className="history-modal-empty">{historyActionError}</p>
                        ) : null}
                        {historyError ? (
                            <p className="history-modal-empty">{historyError}</p>
                        ) : null}
                        {!historyError && historyMessages.length === 0 ? (
                            <p className="history-modal-empty">No commits yet.</p>
                        ) : null}
                        {!historyError && historyMessages.length > 0 ? (
                            <>
                                <div className="history-modal-list">
                                    {historyMessages.map((message, index) => (
                                        <div
                                            key={`${message}-${historyStartIndex + index}`}
                                            className="history-modal-item"
                                        >
                                            <span className="history-modal-index">
                                                {historyStartIndex + index + 1}.
                                            </span>
                                            <span className="history-modal-message">
                                                {message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="history-modal-pagination">
                                    <button
                                        className="history-modal-page-button"
                                        disabled={historyPage <= 1}
                                        onClick={() =>
                                            handleHistoryPageChange(historyPage - 1)
                                        }
                                        type="button"
                                    >
                                        Prev
                                    </button>
                                    <span className="history-modal-page-label">
                                        {historyPage} / {historyTotalPages}
                                    </span>
                                    <button
                                        className="history-modal-page-button"
                                        disabled={historyPage >= historyTotalPages}
                                        onClick={() =>
                                            handleHistoryPageChange(historyPage + 1)
                                        }
                                        type="button"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <ContentPanel
                activeFile={activeFile}
                activeState={activeState}
                externalSearchJump={contentSearchJump}
                onActivateTab={openFile}
                onConsumeSearchJump={(jumpId) => {
                    setContentSearchJump((currentJump) =>
                        currentJump?.id === jumpId ? null : currentJump
                    )
                }}
                onCloseTab={handleCloseTab}
                onChangeContent={(nextContent) => {
                    setEditorStates((currentStates) => ({
                        ...currentStates,
                        [activeFile]: {
                            ...(currentStates[activeFile] || getDefaultEditorState()),
                            content: nextContent,
                            error: '',
                            isDirty: true,
                            isLoaded: true,
                            status: '',
                        },
                    }))
                }}
                editorStates={editorStates}
                openTabs={openTabs}
                onSaveTab={handleSaveTab}
                onToggleTabLock={(fileName) =>
                    setEditorStates((currentStates) => ({
                        ...currentStates,
                        [fileName]: {
                            ...(currentStates[fileName] || getDefaultEditorState()),
                            isLocked:
                                !(currentStates[fileName] || getDefaultEditorState())
                                    .isLocked,
                        },
                    }))
                }
            />
        </main>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)

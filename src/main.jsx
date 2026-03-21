import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import icon from './assets/icon.png'
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

function getPathBaseName(entryPath) {
    return entryPath.split('/').pop() || entryPath
}

function getParentPath(entryPath) {
    const pathParts = entryPath.split('/')
    pathParts.pop()
    return pathParts.join('/')
}

function isSameOrDescendantPath(candidatePath, entryPath) {
    return candidatePath === entryPath || candidatePath.startsWith(`${entryPath}/`)
}

function remapPath(candidatePath, sourcePath, targetPath) {
    if (!isSameOrDescendantPath(candidatePath, sourcePath)) {
        return candidatePath
    }

    return `${targetPath}${candidatePath.slice(sourcePath.length)}`
}

function reorderTabs(tabFiles, draggedFile, targetFile, placement = 'before') {
    if (!draggedFile || !targetFile || draggedFile === targetFile) {
        return tabFiles
    }

    const draggedIndex = tabFiles.indexOf(draggedFile)
    const targetIndex = tabFiles.indexOf(targetFile)

    if (draggedIndex === -1 || targetIndex === -1) {
        return tabFiles
    }

    const nextTabs = [...tabFiles]
    nextTabs.splice(draggedIndex, 1)
    const nextTargetIndex = nextTabs.indexOf(targetFile)
    const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex

    nextTabs.splice(insertIndex, 0, draggedFile)
    return nextTabs
}

function getNextUntitledFileName(fileNames, parentPath = '') {
    const baseName = 'untitled'
    const extension = '.txt'
    const firstChoice = parentPath
        ? `${parentPath}/${baseName}${extension}`
        : `${baseName}${extension}`

    if (!fileNames.includes(firstChoice)) {
        return firstChoice
    }

    let index = 2

    while (
        fileNames.includes(
            parentPath
                ? `${parentPath}/${baseName}-${index}${extension}`
                : `${baseName}-${index}${extension}`
        )
    ) {
        index += 1
    }

    return parentPath
        ? `${parentPath}/${baseName}-${index}${extension}`
        : `${baseName}-${index}${extension}`
}

function getNextUntitledFolderName(entries, parentPath = '') {
    const baseName = 'untitled-folder'
    const folderPaths = entries
        .filter((entry) => entry.type === 'directory')
        .map((entry) => entry.path)
    const firstChoice = parentPath ? `${parentPath}/${baseName}` : baseName

    if (!folderPaths.includes(firstChoice)) {
        return firstChoice
    }

    let index = 2

    while (
        folderPaths.includes(
            parentPath ? `${parentPath}/${baseName}-${index}` : `${baseName}-${index}`
        )
    ) {
        index += 1
    }

    return parentPath ? `${parentPath}/${baseName}-${index}` : `${baseName}-${index}`
}

function formatContentForExport(content) {
    return content.replace(/\[(copy|pass|link)=([^\]]*)\]/g, (_match, type, value) => {
        if (type === 'pass') {
            return '*'.repeat(value.length)
        }

        return value
    })
}

function buildCombinedOpenTabsContent(openTabs, editorStates) {
    const promptHeader = [
        'The content below contains file data from multiple files.',
        'Your task is to help the user search this data for keywords, phrases, and related content.',
        'When the user asks a question, return the matching or most relevant results with the file name and line number for each result.',
        'If multiple results are relevant, list all of them clearly.',
        'After receiving this message, reply only with: "What would you like to search?"',
        '',
    ].join('\n')

    const fileContent = openTabs
        .map((fileName) => {
            const fileContent = formatContentForExport(
                editorStates[fileName]?.content || ''
            )
            return `===== ${fileName} =====\n${fileContent}`
        })
        .join('\n\n')

    return `${promptHeader}${fileContent}`
}

async function searchAcrossFiles(query) {
    if (query.trim() === '') {
        return []
    }

    return window.localFiles.search(query)
}

function App() {
    const historyPageSize = 30
    const [entries, setEntries] = useState([])
    const [activeFile, setActiveFile] = useState('')
    const [openTabs, setOpenTabs] = useState([])
    const [editorStates, setEditorStates] = useState({})
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
    const [isCopyPreviewOpen, setIsCopyPreviewOpen] = useState(false)
    const [isAboutOpen, setIsAboutOpen] = useState(false)
    const files = useMemo(
        () =>
            entries
                .filter((entry) => entry.type === 'file')
                .map((entry) => entry.path)
                .sort((a, b) => a.localeCompare(b)),
        [entries]
    )

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
                const nextEntries = await window.localFiles.list()
                const nextFiles = nextEntries
                    .filter((entry) => entry.type === 'file')
                    .map((entry) => entry.path)

                if (cancelled) {
                    return
                }

                setEntries(nextEntries)

                if (nextFiles.length > 0) {
                    openFile(nextFiles[0])
                } else {
                    setActiveFile('')
                    setOpenTabs([])
                    setEditorStates({})
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
                    setEditingFileName('')
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
                    setEditingFileName('')
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

    async function refreshEntries(nextSelectedFile = activeFile) {
        const nextEntries = await window.localFiles.list()
        const nextFiles = nextEntries
            .filter((entry) => entry.type === 'file')
            .map((entry) => entry.path)
        setEntries(nextEntries)

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

    async function handleCreateFile(parentPath = null) {
        const nextParentPath =
            parentPath === null ? (activeFile ? getParentPath(activeFile) : '') : parentPath
        const fileName = getNextUntitledFileName(files, nextParentPath)

        try {
            await window.localFiles.create(fileName)
            setEditingFileName('')
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
            await refreshEntries(fileName)
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

    async function handleCreateFolder(parentPath = null) {
        const baseFolderPath =
            parentPath === null ? (activeFile ? getParentPath(activeFile) : '') : parentPath
        const nextFolderPath = getNextUntitledFolderName(entries, baseFolderPath)

        try {
            await window.localFiles.createFolder(nextFolderPath)
            await refreshEntries(activeFile)
        } catch (createError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: createError.message || 'Failed to create folder.',
                    status: '',
                },
            }))
        }
    }

    async function handleDeleteEntry(entryPath) {
        const shouldDelete = window.confirm(`Delete ${entryPath}?`)

        if (!shouldDelete) {
            return
        }

        try {
            await window.localFiles.delete(entryPath)
            setEditingFileName('')
            setIsSidebarSearchOpen(false)
            setRenameDraft('')
            setSidebarSearchQuery('')
            setEditorStates((currentStates) => {
                const nextStates = { ...currentStates }
                Object.keys(nextStates).forEach((statePath) => {
                    if (isSameOrDescendantPath(statePath, entryPath)) {
                        delete nextStates[statePath]
                    }
                })
                return nextStates
            })
            setOpenTabs((currentTabs) =>
                currentTabs.filter((tabFileName) => !isSameOrDescendantPath(tabFileName, entryPath))
            )
            setSidebarSearchResults((currentResults) =>
                currentResults.filter(
                    (result) => !isSameOrDescendantPath(result.fileName, entryPath)
                )
            )
            await refreshSidebarSearch()
            await refreshEntries(
                activeFile && isSameOrDescendantPath(activeFile, entryPath)
                    ? getNextSelectedFile(
                          files.filter(
                              (fileName) => !isSameOrDescendantPath(fileName, entryPath)
                          ),
                          ''
                      )
                    : activeFile
            )
        } catch (deleteError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: deleteError.message || `Failed to delete ${entryPath}.`,
                    status: '',
                },
            }))
        }
    }

    async function handleRenameEntry(oldEntryPath) {
        if (!oldEntryPath) {
            setEditingFileName('')
            setRenameDraft('')
            return
        }

        const nextBaseName = renameDraft.trim()
        const nextEntryPath = getParentPath(oldEntryPath)
            ? `${getParentPath(oldEntryPath)}/${nextBaseName}`
            : nextBaseName

        if (nextBaseName === '' || nextEntryPath === oldEntryPath) {
            setEditingFileName('')
            setRenameDraft('')
            return
        }

        try {
            await window.localFiles.rename(oldEntryPath, nextEntryPath)

            setEntries((currentEntries) =>
                currentEntries.map((entry) =>
                    isSameOrDescendantPath(entry.path, oldEntryPath)
                        ? { ...entry, path: remapPath(entry.path, oldEntryPath, nextEntryPath) }
                        : entry
                )
            )
            setOpenTabs((currentTabs) =>
                currentTabs.map((fileName) =>
                    remapPath(fileName, oldEntryPath, nextEntryPath)
                )
            )
            setEditorStates((currentStates) => {
                const nextStates = {}

                Object.entries(currentStates).forEach(([statePath, stateValue]) => {
                    nextStates[remapPath(statePath, oldEntryPath, nextEntryPath)] = stateValue
                })

                return nextStates
            })
            setSidebarSearchResults((currentResults) =>
                currentResults.map((result) =>
                    isSameOrDescendantPath(result.fileName, oldEntryPath)
                        ? {
                              ...result,
                              fileName: remapPath(
                                  result.fileName,
                                  oldEntryPath,
                                  nextEntryPath
                              ),
                          }
                        : result
                )
            )
            await refreshSidebarSearch()

            if (activeFile && isSameOrDescendantPath(activeFile, oldEntryPath)) {
                setActiveFile(remapPath(activeFile, oldEntryPath, nextEntryPath))
            }

            setEditingFileName('')
            setRenameDraft('')
        } catch (renameError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: renameError.message || `Failed to rename ${oldEntryPath}.`,
                    status: '',
                },
            }))
        }
    }

    async function handleMoveFile(fileName, targetFolderPath) {
        const fileBaseName = getPathBaseName(fileName)
        const nextFilePath = targetFolderPath
            ? `${targetFolderPath}/${fileBaseName}`
            : fileBaseName

        if (nextFilePath === fileName) {
            return
        }

        try {
            await window.localFiles.rename(fileName, nextFilePath)
            setEntries((currentEntries) =>
                currentEntries.map((entry) =>
                    entry.path === fileName ? { ...entry, path: nextFilePath } : entry
                )
            )
            setOpenTabs((currentTabs) =>
                currentTabs.map((openTab) =>
                    openTab === fileName ? nextFilePath : openTab
                )
            )
            setEditorStates((currentStates) => {
                const nextStates = { ...currentStates }
                nextStates[nextFilePath] =
                    nextStates[fileName] || getDefaultEditorState()
                delete nextStates[fileName]
                return nextStates
            })
            setSidebarSearchResults((currentResults) =>
                currentResults.map((result) =>
                    result.fileName === fileName
                        ? { ...result, fileName: nextFilePath }
                        : result
                )
            )

            if (activeFile === fileName) {
                setActiveFile(nextFilePath)
            }

            await refreshSidebarSearch()
            await refreshEntries(activeFile === fileName ? nextFilePath : activeFile)
        } catch (moveError) {
            setEditorStates((currentStates) => ({
                ...currentStates,
                [activeFile]: {
                    ...(currentStates[activeFile] || getDefaultEditorState()),
                    error: moveError.message || `Failed to move ${fileName}.`,
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

    function handleCloseAllTabs() {
        setOpenTabs([])
        setActiveFile('')
    }

    function handleCloseOtherTabs(fileName) {
        if (!fileName || !openTabs.includes(fileName)) {
            return
        }

        setOpenTabs([fileName])
        setActiveFile(fileName)
    }

    function handleCloseTabsToRight(fileName) {
        const tabIndex = openTabs.indexOf(fileName)

        if (tabIndex === -1) {
            return
        }

        const nextTabs = openTabs.slice(0, tabIndex + 1)
        setOpenTabs(nextTabs)

        if (!nextTabs.includes(activeFile)) {
            setActiveFile(fileName)
        }
    }

    function handleReorderTabs(draggedFile, targetFile, placement) {
        setOpenTabs((currentTabs) =>
            reorderTabs(currentTabs, draggedFile, targetFile, placement)
        )
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
                editingFileName={editingFileName}
                entries={entries}
                isAboutOpen={isAboutOpen}
                isHistoryOpen={isHistoryOpen}
                isUsageLookupOpen={isUsageLookupOpen}
                isSidebarSearchOpen={isSidebarSearchOpen}
                isSidebarSearchLoading={isSidebarSearchLoading}
                onChangeSidebarSearch={setSidebarSearchQuery}
                onOpenAbout={() => setIsAboutOpen(true)}
                onOpenHistory={openHistoryModal}
                onOpenUsageLookup={() => setIsUsageLookupOpen(true)}
                onCopyOpenFiles={async () => {
                    await navigator.clipboard.writeText(combinedOpenTabsContent)
                    setIsCopyPreviewOpen(true)
                }}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onDeleteEntry={handleDeleteEntry}
                onMoveFile={handleMoveFile}
                openFileCount={openTabs.length}
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
                onRenameCommit={handleRenameEntry}
                onRenameStart={(entryPath) => {
                    setEditingFileName(entryPath)
                    setRenameDraft(getPathBaseName(entryPath))
                }}
                onSelectFile={openFile}
                onToggleSidebarSearch={() => {
                    setIsSidebarSearchOpen((current) => !current)
                    setSidebarSearchQuery('')
                    setSidebarSearchResults([])
                }}
                renameDraft={renameDraft}
                searchResults={sidebarSearchResults}
                sidebarSearchQuery={sidebarSearchQuery}
                selectedFile={activeFile}
            />
            {isAboutOpen ? (
                <div className="history-modal-backdrop" role="presentation">
                    <div
                        aria-labelledby="about-modal-title"
                        aria-modal="true"
                        className="history-modal about-modal"
                        role="dialog"
                    >
                        <div className="history-modal-header">
                            <h2 id="about-modal-title">About</h2>
                            <div className="history-modal-header-actions">
                                <button
                                    aria-label="Close app info"
                                    className="history-modal-close"
                                    onClick={() => setIsAboutOpen(false)}
                                    type="button"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        <div className="about-modal-content">
                            <img alt="App icon" className="about-modal-logo" src={icon} />
                            <p className="about-modal-title">Developed by Colin Zhao</p>
                            <p className="about-modal-description">
                                A small experimental file-browser app built to explore
                                what Codex can do in a real workflow.
                            </p>
                            <p className="about-modal-version">Version 1.0.0</p>
                        </div>
                    </div>
                </div>
            ) : null}
            {isCopyPreviewOpen ? (
                <div className="history-modal-backdrop" role="presentation">
                    <div
                        aria-labelledby="copy-preview-title"
                        aria-modal="true"
                        className="history-modal copy-preview-modal"
                        role="dialog"
                    >
                        <div className="history-modal-header">
                            <h2 id="copy-preview-title"></h2>
                            <div className="history-modal-header-actions">
                                <button
                                    aria-label="Close copy summary"
                                    className="history-modal-close"
                                    onClick={() => setIsCopyPreviewOpen(false)}
                                    type="button"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        <div className="copy-preview-header">
                            <p className="copy-preview-title">
                                Copied {openTabs.length} files to clipboard
                            </p>
                            <p className="copy-preview-subtitle">
                                Review the exported content below if you want to verify
                                what was copied.
                            </p>
                        </div>
                        <div className="copy-preview-box">{combinedOpenTabsContent}</div>
                        <div className="copy-preview-footer">
                            <button
                                className="history-modal-page-button"
                                onClick={() => setIsCopyPreviewOpen(false)}
                                type="button"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
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
                onCloseAllTabs={handleCloseAllTabs}
                onCloseOtherTabs={handleCloseOtherTabs}
                onCloseTabsToRight={handleCloseTabsToRight}
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
                onReorderTabs={handleReorderTabs}
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

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ContentPanel } from './components/ContentPanel'
import { Sidebar } from './components/Sidebar'
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

function App() {
    const [files, setFiles] = useState([])
    const [activeFile, setActiveFile] = useState('')
    const [openTabs, setOpenTabs] = useState([])
    const [editorStates, setEditorStates] = useState({})
    const [copyBubble, setCopyBubble] = useState(null)
    const [deleteUnlockedFile, setDeleteUnlockedFile] = useState('')
    const [editingFileName, setEditingFileName] = useState('')
    const [renameDraft, setRenameDraft] = useState('')

    const activeState = activeFile
        ? editorStates[activeFile] || getDefaultEditorState()
        : getDefaultEditorState()
    const combinedOpenTabsContent = buildCombinedOpenTabsContent(openTabs, editorStates)

    function openFile(fileName) {
        setActiveFile(fileName)
        setOpenTabs((currentTabs) =>
            currentTabs.includes(fileName) ? currentTabs : [...currentTabs, fileName]
        )
    }

    useEffect(() => {
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
                    setRenameDraft('')
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
    }, [])

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

    async function handleSaveTab(fileName) {
        const nextState = editorStates[fileName] || getDefaultEditorState()

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
            setRenameDraft('')
            setEditorStates((currentStates) => ({
                ...currentStates,
                [fileName]: {
                    ...getDefaultEditorState(),
                    isLoaded: true,
                    status: `Created ${fileName}`,
                },
            }))
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
            setRenameDraft('')
            setEditorStates((currentStates) => {
                const nextStates = { ...currentStates }
                delete nextStates[fileName]
                return nextStates
            })
            setOpenTabs((currentTabs) =>
                currentTabs.filter((tabFileName) => tabFileName !== fileName)
            )
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

    return (
        <main className="app-shell">
            <Sidebar
                deleteUnlockedFile={deleteUnlockedFile}
                editingFileName={editingFileName}
                files={files}
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
                onToggleDeleteLock={(fileName) =>
                    setDeleteUnlockedFile((current) =>
                        current === fileName ? '' : fileName
                    )
                }
                renameDraft={renameDraft}
                selectedFile={activeFile}
            />
            <ContentPanel
                activeFile={activeFile}
                activeState={activeState}
                onActivateTab={setActiveFile}
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

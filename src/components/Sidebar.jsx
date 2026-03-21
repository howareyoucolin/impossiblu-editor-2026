import React, { useEffect, useMemo, useState } from 'react'

function createFolderNode(path, name) {
    return {
        files: [],
        folders: [],
        name,
        path,
    }
}

function getParentPath(entryPath) {
    const pathParts = entryPath.split('/')
    pathParts.pop()
    return pathParts.join('/')
}

function buildSidebarTree(entries) {
    const rootNode = createFolderNode('', 'root')
    const folderMap = new Map([['', rootNode]])
    const sortedEntries = [...entries].sort((leftEntry, rightEntry) =>
        leftEntry.path.localeCompare(rightEntry.path)
    )

    sortedEntries.forEach((entry) => {
        const pathParts = entry.path.split('/')
        let currentPath = ''
        let currentFolder = rootNode

        pathParts.forEach((part, index) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part
            const isLeaf = index === pathParts.length - 1

            if (isLeaf && entry.type === 'file') {
                currentFolder.files.push({
                    name: part,
                    path: entry.path,
                })
                return
            }

            let nextFolder = folderMap.get(currentPath)

            if (!nextFolder) {
                nextFolder = createFolderNode(currentPath, part)
                folderMap.set(currentPath, nextFolder)
                currentFolder.folders.push(nextFolder)
            }

            currentFolder = nextFolder
        })
    })

    function sortNode(node) {
        node.folders.sort((leftFolder, rightFolder) =>
            leftFolder.name.localeCompare(rightFolder.name)
        )
        node.files.sort((leftFile, rightFile) =>
            leftFile.name.localeCompare(rightFile.name)
        )
        node.folders.forEach(sortNode)
        return node
    }

    return sortNode(rootNode)
}

export function Sidebar({
    isAboutOpen,
    editingFileName,
    entries,
    isHistoryOpen,
    isUsageLookupOpen,
    isSidebarSearchOpen,
    isSidebarSearchLoading,
    onChangeSidebarSearch,
    onOpenHistory,
    onOpenUsageLookup,
    onOpenAbout,
    onCopyOpenFiles,
    onCreateFile,
    onCreateFolder,
    onDeleteEntry,
    onMoveFile,
    openFileCount,
    onSelectSearchResult,
    onRenameCancel,
    onRenameChange,
    onRenameCommit,
    onRenameStart,
    onSelectFile,
    onToggleSidebarSearch,
    renameDraft,
    searchResults,
    sidebarSearchQuery,
    selectedFile,
}) {
    const contextMenuRef = React.useRef(null)
    const [hoveredToolbarButton, setHoveredToolbarButton] = useState('')
    const [expandedFolders, setExpandedFolders] = useState({})
    const [draggedFile, setDraggedFile] = useState('')
    const [dropTargetPath, setDropTargetPath] = useState('')
    const [contextMenu, setContextMenu] = useState(null)
    const tree = useMemo(() => buildSidebarTree(entries), [entries])

    useEffect(() => {
        setExpandedFolders((currentFolders) => {
            const nextFolders = { ...currentFolders }

            entries
                .filter((entry) => entry.type === 'directory')
                .forEach((entry) => {
                    if (!(entry.path in nextFolders)) {
                        nextFolders[entry.path] = true
                    }
                })

            return nextFolders
        })
    }, [entries])

    useEffect(() => {
        if (!contextMenu) {
            return undefined
        }

        function handleWindowPointerDown(event) {
            if (event.button === 2) {
                return
            }

            if (contextMenuRef.current?.contains(event.target)) {
                return
            }

            setContextMenu(null)
        }

        function handleWindowKeyDown(event) {
            if (event.key === 'Escape') {
                setContextMenu(null)
            }
        }

        function handleWindowBlur() {
            setContextMenu(null)
        }

        window.addEventListener('pointerdown', handleWindowPointerDown)
        window.addEventListener('keydown', handleWindowKeyDown)
        window.addEventListener('blur', handleWindowBlur)

        return () => {
            window.removeEventListener('pointerdown', handleWindowPointerDown)
            window.removeEventListener('keydown', handleWindowKeyDown)
            window.removeEventListener('blur', handleWindowBlur)
        }
    }, [contextMenu])

    function toggleFolder(folderPath) {
        setExpandedFolders((currentFolders) => ({
            ...currentFolders,
            [folderPath]: !currentFolders[folderPath],
        }))
    }

    function folderContainsSelectedFile(folderPath) {
        return selectedFile.startsWith(`${folderPath}/`)
    }

    function handleSidebarContextMenu(context, event) {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
            ...context,
            x: event.clientX,
            y: event.clientY,
        })
    }

    function handleContextMenuAction(action) {
        if (!contextMenu) {
            return
        }

        if (action === 'new-file') {
            onCreateFile(contextMenu.parentPath || '')
        }

        if (action === 'new-folder') {
            onCreateFolder(contextMenu.parentPath || '')
        }

        if (action === 'rename' && contextMenu.targetPath) {
            onRenameStart(contextMenu.targetPath)
        }

        if (action === 'delete' && contextMenu.targetPath) {
            onDeleteEntry(contextMenu.targetPath)
        }

        setContextMenu(null)
    }

    function handleFolderDrop(folderPath, event) {
        event.preventDefault()
        event.stopPropagation()
        setDropTargetPath('')

        if (!draggedFile) {
            return
        }

        onMoveFile(draggedFile, folderPath)
        setDraggedFile('')
    }

    function handleRootDrop(event) {
        event.preventDefault()
        event.stopPropagation()
        setDropTargetPath('')

        if (!draggedFile) {
            return
        }

        onMoveFile(draggedFile, '')
        setDraggedFile('')
    }

    function renderFileRow(file, depth = 0) {
        return (
            <div
                key={file.path}
                className={file.path === selectedFile ? 'file-row is-active' : 'file-row'}
                draggable
                onContextMenu={(event) => {
                    handleSidebarContextMenu(
                        {
                            parentPath: getParentPath(file.path),
                            targetPath: file.path,
                            targetType: 'file',
                        },
                        event
                    )
                }}
                onDragEnd={() => setDraggedFile('')}
                onDragStart={() => setDraggedFile(file.path)}
                style={{ '--tree-depth': depth }}
            >
                {editingFileName === file.path ? (
                    <input
                        autoFocus
                        className="file-rename-input"
                        onBlur={() => onRenameCommit(file.path)}
                        onChange={(event) => onRenameChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                onRenameCommit(file.path)
                            }

                            if (event.key === 'Escape') {
                                onRenameCancel()
                            }
                        }}
                        value={renameDraft}
                    />
                ) : (
                    <button
                        className="file-button"
                        onClick={() => onSelectFile(file.path)}
                        onDoubleClick={() => onRenameStart(file.path)}
                        type="button"
                    >
                        {file.name}
                    </button>
                )}
            </div>
        )
    }

    function renderFolderNode(folder, depth = 0) {
        const isExpanded = expandedFolders[folder.path] ?? true
        const containsSelectedFile = folderContainsSelectedFile(folder.path)
        const childCount = folder.folders.length + folder.files.length

        return (
            <div key={folder.path} className="tree-group">
                {editingFileName === folder.path ? (
                    <div
                        className={[
                            'folder-row',
                            containsSelectedFile ? 'contains-active' : '',
                            'is-editing',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        style={{ '--tree-depth': depth }}
                    >
                        <span className="folder-chevron" aria-hidden="true">
                            <i
                                className={
                                    isExpanded
                                        ? 'fa-solid fa-chevron-down'
                                        : 'fa-solid fa-chevron-right'
                                }
                            />
                        </span>
                        <span className="folder-icon" aria-hidden="true">
                            <i className="fa-solid fa-folder" />
                        </span>
                        <input
                            autoFocus
                            className="file-rename-input folder-rename-input"
                            onBlur={() => onRenameCommit(folder.path)}
                            onChange={(event) => onRenameChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    onRenameCommit(folder.path)
                                }

                                if (event.key === 'Escape') {
                                    onRenameCancel()
                                }
                            }}
                            value={renameDraft}
                        />
                        <span className="folder-meta">{childCount}</span>
                    </div>
                ) : (
                    <button
                        className={[
                            'folder-row',
                            containsSelectedFile ? 'contains-active' : '',
                            dropTargetPath === folder.path ? 'is-drop-target' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onClick={() => toggleFolder(folder.path)}
                        onContextMenu={(event) => {
                            handleSidebarContextMenu(
                                {
                                    parentPath: folder.path,
                                    targetPath: folder.path,
                                    targetType: 'directory',
                                },
                                event
                            )
                        }}
                        onDragOver={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setDropTargetPath(folder.path)

                            if (!isExpanded) {
                                setExpandedFolders((currentFolders) => ({
                                    ...currentFolders,
                                    [folder.path]: true,
                                }))
                            }
                        }}
                        onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                                setDropTargetPath('')
                            }
                        }}
                        onDrop={(event) => handleFolderDrop(folder.path, event)}
                        style={{ '--tree-depth': depth }}
                        type="button"
                    >
                        <span className="folder-chevron" aria-hidden="true">
                            <i
                                className={
                                    isExpanded
                                        ? 'fa-solid fa-chevron-down'
                                        : 'fa-solid fa-chevron-right'
                                }
                            />
                        </span>
                        <span className="folder-icon" aria-hidden="true">
                            <i className="fa-solid fa-folder" />
                        </span>
                        <span className="folder-label">{folder.name}</span>
                        <span className="folder-meta">{childCount}</span>
                    </button>
                )}
                {isExpanded ? (
                    <div className="tree-children">
                        {folder.folders.map((childFolder) =>
                            renderFolderNode(childFolder, depth + 1)
                        )}
                        {folder.files.map((file) => renderFileRow(file, depth + 1))}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-toolbar">
                <div className="sidebar-toolbar-actions">
                    <button
                        className={
                            isAboutOpen
                                ? 'sidebar-add-button is-active'
                                : 'sidebar-add-button'
                        }
                        aria-label="Show app info"
                        onClick={onOpenAbout}
                        onMouseEnter={() => setHoveredToolbarButton('About')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    </button>
                    <button
                        className={
                            isUsageLookupOpen
                                ? 'sidebar-add-button is-active'
                                : 'sidebar-add-button'
                        }
                        aria-label="Show custom tag usage"
                        onClick={onOpenUsageLookup}
                        onMouseEnter={() => setHoveredToolbarButton('Tag Usage')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-circle-question" aria-hidden="true" />
                    </button>
                    <button
                        className={
                            isHistoryOpen
                                ? 'sidebar-add-button is-active'
                                : 'sidebar-add-button'
                        }
                        aria-label="Show recent commit history"
                        onClick={onOpenHistory}
                        onMouseEnter={() => setHoveredToolbarButton('Recent Commits')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                    </button>
                    <button
                        className={
                            isSidebarSearchOpen
                                ? 'sidebar-add-button is-active'
                                : 'sidebar-add-button'
                        }
                        aria-label="Toggle file search"
                        onClick={onToggleSidebarSearch}
                        onMouseEnter={() => setHoveredToolbarButton('Search Files')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                    </button>
                    <button
                        className="sidebar-add-button"
                        aria-label="Copy open files for ChatGPT"
                        disabled={openFileCount === 0}
                        onClick={onCopyOpenFiles}
                        onMouseEnter={() => setHoveredToolbarButton('Copy Open Files')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-copy" aria-hidden="true" />
                    </button>
                </div>
            </div>
            {hoveredToolbarButton ? (
                <div className="sidebar-toolbar-tooltip">{hoveredToolbarButton}</div>
            ) : null}
            {isSidebarSearchOpen ? (
                <div className="sidebar-search-panel">
                    <div className="sidebar-search">
                        <i
                            className="fa-solid fa-magnifying-glass sidebar-search-icon"
                            aria-hidden="true"
                        />
                        <input
                            autoFocus
                            className="sidebar-search-input"
                            onChange={(event) => onChangeSidebarSearch(event.target.value)}
                            placeholder="Search across files"
                            type="text"
                            value={sidebarSearchQuery}
                        />
                    </div>
                    <div className="sidebar-search-results">
                        {sidebarSearchQuery.trim() === '' ? (
                            <p className="sidebar-search-empty">
                                Type a keyword to search all files.
                            </p>
                        ) : null}
                        {sidebarSearchQuery.trim() !== '' && isSidebarSearchLoading ? (
                            <p className="sidebar-search-empty">Searching...</p>
                        ) : null}
                        {sidebarSearchQuery.trim() !== '' &&
                        !isSidebarSearchLoading &&
                        searchResults.length === 0 ? (
                            <p className="sidebar-search-empty">No matches found.</p>
                        ) : null}
                        {searchResults.map((result) => (
                            <button
                                key={`${result.fileName}:${result.lineNumber}:${result.lineText}`}
                                className="sidebar-search-result"
                                onClick={() => onSelectSearchResult(result)}
                                type="button"
                            >
                                <span className="sidebar-search-result-file">
                                    {result.fileName}
                                </span>
                                <span className="sidebar-search-result-line">
                                    Line {result.lineNumber}
                                </span>
                                <span className="sidebar-search-result-text">
                                    {result.lineText.trim() || '(empty line)'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
            {!isSidebarSearchOpen ? (
                <div
                    className="file-list"
                    onContextMenu={(event) =>
                        handleSidebarContextMenu(
                            {
                                parentPath: '',
                                targetPath: '',
                                targetType: 'root',
                            },
                            event
                        )
                    }
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDropTargetPath('__root__')
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                            setDropTargetPath('')
                        }
                    }}
                    onDrop={handleRootDrop}
                >
                    <button
                        className={[
                            'sidebar-root-dropzone',
                            dropTargetPath === '__root__' ? 'is-drop-target' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onContextMenu={(event) =>
                            handleSidebarContextMenu(
                                {
                                    parentPath: '',
                                    targetPath: '',
                                    targetType: 'root',
                                },
                                event
                            )
                        }
                        onDragOver={(event) => {
                            event.preventDefault()
                            setDropTargetPath('__root__')
                        }}
                        onDrop={handleRootDrop}
                        type="button"
                    >
                        <span className="sidebar-root-icon" aria-hidden="true">
                            <i className="fa-solid fa-house" />
                        </span>
                        <span>Root</span>
                        <span className="sidebar-root-hint">Right-click to create</span>
                    </button>
                    {tree.folders.map((folder) => renderFolderNode(folder))}
                    {tree.files.map((file) => renderFileRow(file))}
                </div>
            ) : null}
            {contextMenu ? (
                <div
                    className="tab-context-menu sidebar-context-menu"
                    ref={contextMenuRef}
                    role="menu"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y,
                    }}
                >
                    <button
                        className="tab-context-menu-item"
                        onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleContextMenuAction('new-file')
                        }}
                        role="menuitem"
                        type="button"
                    >
                        New File
                    </button>
                    <button
                        className="tab-context-menu-item"
                        onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleContextMenuAction('new-folder')
                        }}
                        role="menuitem"
                        type="button"
                    >
                        New Folder
                    </button>
                    {contextMenu.targetType !== 'root' ? (
                        <button
                            className="tab-context-menu-item"
                            onPointerDown={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleContextMenuAction('rename')
                            }}
                            role="menuitem"
                            type="button"
                        >
                            Rename
                        </button>
                    ) : null}
                    {contextMenu.targetType !== 'root' ? (
                        <button
                            className="tab-context-menu-item danger"
                            onPointerDown={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleContextMenuAction('delete')
                            }}
                            role="menuitem"
                            type="button"
                        >
                            Delete
                        </button>
                    ) : null}
                </div>
            ) : null}
        </aside>
    )
}

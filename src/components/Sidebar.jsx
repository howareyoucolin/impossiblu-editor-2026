import React, { useState } from 'react'

export function Sidebar({
    deleteUnlockedFile,
    editingFileName,
    files,
    isHistoryOpen,
    isUsageLookupOpen,
    isSidebarSearchOpen,
    isSidebarSearchLoading,
    onChangeSidebarSearch,
    onOpenHistory,
    onOpenUsageLookup,
    onCopyOpenFiles,
    onCreateFile,
    onDeleteFile,
    onSelectSearchResult,
    onRenameCancel,
    onRenameChange,
    onRenameCommit,
    onRenameStart,
    onSelectFile,
    onToggleSidebarSearch,
    onToggleDeleteLock,
    renameDraft,
    searchResults,
    sidebarSearchQuery,
    selectedFile,
}) {
    const [hoveredToolbarButton, setHoveredToolbarButton] = useState('')

    return (
        <aside className="sidebar">
            <div className="sidebar-toolbar">
                <div className="sidebar-toolbar-actions">
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
                        onClick={onCopyOpenFiles}
                        onMouseEnter={() => setHoveredToolbarButton('Copy Open Files')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-copy" aria-hidden="true" />
                    </button>
                    <button
                        className="sidebar-add-button"
                        aria-label="Add new file"
                        onClick={onCreateFile}
                        onMouseEnter={() => setHoveredToolbarButton('Add New File')}
                        onMouseLeave={() => setHoveredToolbarButton('')}
                        type="button"
                    >
                        <i className="fa-solid fa-file-circle-plus" aria-hidden="true" />
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
                <div className="file-list">
                    {files.map((fileName) => (
                        <div
                            key={fileName}
                            className={
                                fileName === selectedFile
                                    ? 'file-row is-active'
                                    : 'file-row'
                            }
                        >
                            {editingFileName === fileName ? (
                                <input
                                    autoFocus
                                    className="file-rename-input"
                                    onBlur={() => onRenameCommit(fileName)}
                                    onChange={(event) =>
                                        onRenameChange(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            onRenameCommit(fileName)
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
                                    onClick={() => onSelectFile(fileName)}
                                    onDoubleClick={() => onRenameStart(fileName)}
                                    type="button"
                                >
                                    {fileName}
                                </button>
                            )}
                            <div className="file-actions">
                                {fileName === selectedFile ? (
                                    <button
                                        aria-label={
                                            deleteUnlockedFile === fileName
                                                ? `Lock delete for ${fileName}`
                                                : `Unlock delete for ${fileName}`
                                        }
                                        className="file-lock-button"
                                        onClick={() => onToggleDeleteLock(fileName)}
                                        type="button"
                                    >
                                        <i
                                            aria-hidden="true"
                                            className={
                                                deleteUnlockedFile === fileName
                                                    ? 'fa-solid fa-unlock'
                                                    : 'fa-solid fa-lock'
                                            }
                                        />
                                    </button>
                                ) : null}
                                <button
                                    aria-label={`Delete ${fileName}`}
                                    className="file-delete-button"
                                    disabled={deleteUnlockedFile !== fileName}
                                    onClick={() => onDeleteFile(fileName)}
                                    type="button"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </aside>
    )
}

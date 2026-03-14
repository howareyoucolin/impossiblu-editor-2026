import React from 'react'

export function Sidebar({
    copyBubble,
    deleteUnlockedFile,
    editingFileName,
    files,
    onCopyOpenFiles,
    onCreateFile,
    onDeleteFile,
    onRenameCancel,
    onRenameChange,
    onRenameCommit,
    onRenameStart,
    onSelectFile,
    onToggleDeleteLock,
    renameDraft,
    selectedFile,
}) {
    return (
        <aside className="sidebar">
            <div className="sidebar-toolbar">
                <h1>Files</h1>
                <div className="sidebar-toolbar-actions">
                    <button
                        className="sidebar-add-button"
                        aria-label="Copy open files for ChatGPT"
                        onClick={onCopyOpenFiles}
                        type="button"
                    >
                        <i className="fa-solid fa-copy" aria-hidden="true" />
                    </button>
                    <button
                        className="sidebar-add-button"
                        aria-label="Add new file"
                        onClick={onCreateFile}
                        type="button"
                    >
                        <i className="fa-solid fa-file-circle-plus" aria-hidden="true" />
                    </button>
                </div>
            </div>
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
            {copyBubble ? (
                <div
                    className="copy-bubble"
                    style={{
                        left: `${copyBubble.x}px`,
                        top: `${copyBubble.y}px`,
                    }}
                >
                    {copyBubble.label}
                </div>
            ) : null}
        </aside>
    )
}

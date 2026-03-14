import React from 'react'

export function Sidebar({
    deleteUnlockedFile,
    files,
    onCreateFile,
    onDeleteFile,
    onSelectFile,
    onToggleDeleteLock,
    selectedFile,
}) {
    return (
        <aside className="sidebar">
            <div className="sidebar-toolbar">
                <h1>Files</h1>
                <button
                    className="sidebar-add-button"
                    aria-label="Add new file"
                    onClick={onCreateFile}
                    type="button"
                >
                    <i className="fa-solid fa-file-circle-plus" aria-hidden="true" />
                </button>
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
                        <button
                            className="file-button"
                            onClick={() => onSelectFile(fileName)}
                            type="button"
                        >
                            {fileName}
                        </button>
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
        </aside>
    )
}

import React, { useRef } from 'react'

function formatTabLabel(fileName) {
    return fileName.length > 15 ? `${fileName.slice(0, 15)}...` : fileName
}

export function ContentPanel({
    activeFile,
    activeState,
    onActivateTab,
    onCloseTab,
    onSaveTab,
    onToggleTabLock,
    openTabs,
    editorStates,
    onChangeContent,
}) {
    const lineNumbersRef = useRef(null)
    const isLocked = activeState?.isLocked ?? true
    const content = activeState?.content || ''
    const lineCount = content.split('\n').length
    const lineNumbers = Array.from({ length: lineCount }, (_value, index) => index + 1)

    return (
        <section className="content-panel">
            <header className="content-header"></header>
            {openTabs.length > 0 ? (
                <div className="content-tabs" role="tablist" aria-label="Open files">
                    {openTabs.map((fileName) => {
                        const tabState = editorStates[fileName]
                        const tabLocked = tabState?.isLocked ?? true
                        const tabDirty = tabState?.isDirty ?? false

                        return (
                            <div
                                key={fileName}
                                className={fileName === activeFile ? 'content-tab is-active' : 'content-tab'}
                                role="tab"
                            >
                                <button className="content-tab-label" onClick={() => onActivateTab(fileName)} type="button">
                                    {formatTabLabel(fileName)}
                                </button>
                                <div className="content-tab-actions">
                                    <button
                                        aria-label={`Save ${fileName}`}
                                        className="content-tab-icon-button"
                                        disabled={tabLocked || !tabDirty}
                                        onClick={() => onSaveTab(fileName)}
                                        type="button"
                                    >
                                        <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                                    </button>
                                    <button
                                        aria-label={tabLocked ? `Unlock ${fileName}` : `Lock ${fileName}`}
                                        className="content-tab-icon-button"
                                        onClick={() => onToggleTabLock(fileName)}
                                        type="button"
                                    >
                                        <i aria-hidden="true" className={tabLocked ? 'fa-solid fa-lock' : 'fa-solid fa-unlock'} />
                                    </button>
                                    <button
                                        aria-label={`Close ${fileName}`}
                                        className="content-tab-icon-button"
                                        onClick={() => onCloseTab(fileName)}
                                        type="button"
                                    >
                                        x
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : null}
            {activeFile ? (
                <div className="editor-shell">
                    <div className="line-numbers" ref={lineNumbersRef}>
                        {lineNumbers.map((lineNumber) => (
                            <div key={lineNumber} className="line-number">
                                {lineNumber}
                            </div>
                        ))}
                    </div>
                    <textarea
                        className="content-editor"
                        readOnly={isLocked}
                        onChange={(event) => onChangeContent(event.target.value)}
                        onScroll={(event) => {
                            if (lineNumbersRef.current) {
                                lineNumbersRef.current.scrollTop =
                                    event.target.scrollTop
                            }
                        }}
                        spellCheck={false}
                        value={content}
                    />
                </div>
            ) : (
                <p className="message">No files found in local-data.</p>
            )}
        </section>
    )
}

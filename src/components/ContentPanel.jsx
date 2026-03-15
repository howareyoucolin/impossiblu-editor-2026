import React, { useEffect, useMemo, useRef, useState } from 'react'

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
    const editorRef = useRef(null)
    const isLocked = activeState?.isLocked ?? true
    const content = activeState?.content || ''
    const lineCount = content.split('\n').length
    const lineNumbers = Array.from({ length: lineCount }, (_value, index) => index + 1)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeMatchIndex, setActiveMatchIndex] = useState(0)

    const matches = useMemo(() => {
        if (!searchTerm) {
            return []
        }

        const lowerContent = content.toLowerCase()
        const lowerSearchTerm = searchTerm.toLowerCase()
        const nextMatches = []
        let startIndex = 0

        while (startIndex < lowerContent.length) {
            const matchIndex = lowerContent.indexOf(lowerSearchTerm, startIndex)

            if (matchIndex === -1) {
                break
            }

            nextMatches.push({
                end: matchIndex + searchTerm.length,
                start: matchIndex,
            })
            startIndex = matchIndex + lowerSearchTerm.length
        }

        return nextMatches
    }, [content, searchTerm])

    useEffect(() => {
        setSearchTerm('')
        setActiveMatchIndex(0)
    }, [activeFile])

    useEffect(() => {
        if (matches.length === 0) {
            setActiveMatchIndex(0)
            return
        }

        if (activeMatchIndex >= matches.length) {
            setActiveMatchIndex(0)
        }
    }, [activeMatchIndex, matches])

    function focusMatch(matchIndex) {
        const match = matches[matchIndex]

        if (!match || !editorRef.current) {
            return
        }

        editorRef.current.focus()
        editorRef.current.setSelectionRange(match.start, match.end)
    }

    function handleSearchStep(direction) {
        if (matches.length === 0) {
            return
        }

        const nextIndex =
            direction === 'next'
                ? (activeMatchIndex + 1) % matches.length
                : (activeMatchIndex - 1 + matches.length) % matches.length

        setActiveMatchIndex(nextIndex)
        focusMatch(nextIndex)
    }

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
                    <div className="content-search content-search-inline">
                        <input
                            className="content-search-input"
                            onChange={(event) => {
                                setSearchTerm(event.target.value)
                                setActiveMatchIndex(0)
                            }}
                            placeholder="Search"
                            type="text"
                            value={searchTerm}
                        />
                        <span className="content-search-count">
                            {matches.length > 0
                                ? `${activeMatchIndex + 1}/${matches.length}`
                                : '0/0'}
                        </span>
                        <button
                            className="content-search-button"
                            disabled={matches.length === 0}
                            onClick={() => handleSearchStep('previous')}
                            type="button"
                        >
                            <i className="fa-solid fa-chevron-up" aria-hidden="true" />
                        </button>
                        <button
                            className="content-search-button"
                            disabled={matches.length === 0}
                            onClick={() => handleSearchStep('next')}
                            type="button"
                        >
                            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="line-numbers" ref={lineNumbersRef}>
                        {lineNumbers.map((lineNumber) => (
                            <div key={lineNumber} className="line-number">
                                {lineNumber}
                            </div>
                        ))}
                    </div>
                    <textarea
                        ref={editorRef}
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

import React, { useEffect, useMemo, useRef, useState } from 'react'

const TAG_PATTERN = /\[(copy|pass|link)=([^\]]*)\]/g

function formatTabLabel(fileName) {
    return fileName.length > 15 ? `${fileName.slice(0, 15)}...` : fileName
}

function parseReadonlySegments(content) {
    const segments = []
    let lastIndex = 0
    let match
    TAG_PATTERN.lastIndex = 0

    while ((match = TAG_PATTERN.exec(content)) !== null) {
        const [rawText, type, value] = match
        const start = match.index

        if (start > lastIndex) {
            segments.push({
                displayText: content.slice(lastIndex, start),
                rawEnd: start,
                rawStart: lastIndex,
                type: 'text',
            })
        }

        const prefixLength = `[${type}=`.length

        segments.push({
            displayText: type === 'pass' ? '*'.repeat(value.length) : value,
            rawEnd: start + rawText.length,
            rawStart: start,
            type,
            value,
            valueRawEnd: start + prefixLength + value.length,
            valueRawStart: start + prefixLength,
        })

        lastIndex = start + rawText.length
    }

    if (lastIndex < content.length) {
        segments.push({
            displayText: content.slice(lastIndex),
            rawEnd: content.length,
            rawStart: lastIndex,
            type: 'text',
        })
    }

    return segments
}

function buildSegmentParts(segment, matches, activeMatchIndex) {
    const hasValueRange =
        typeof segment.valueRawStart === 'number' && typeof segment.valueRawEnd === 'number'
    const segmentStart = hasValueRange ? segment.valueRawStart : segment.rawStart
    const segmentEnd = hasValueRange ? segment.valueRawEnd : segment.rawEnd
    const nextParts = []
    let cursor = segmentStart

    matches.forEach((match, matchIndex) => {
        const overlapStart = Math.max(segmentStart, match.start)
        const overlapEnd = Math.min(segmentEnd, match.end)

        if (overlapStart >= overlapEnd) {
            return
        }

        if (cursor < overlapStart) {
            nextParts.push({
                isActive: false,
                isMatch: false,
                text: segment.displayText.slice(
                    cursor - segmentStart,
                    overlapStart - segmentStart
                ),
            })
        }

        nextParts.push({
            isActive: matchIndex === activeMatchIndex,
            isMatch: true,
            matchIndex,
            text: segment.displayText.slice(
                overlapStart - segmentStart,
                overlapEnd - segmentStart
            ),
        })
        cursor = overlapEnd
    })

    if (cursor < segmentEnd) {
        nextParts.push({
            isActive: false,
            isMatch: false,
            text: segment.displayText.slice(cursor - segmentStart),
        })
    }

    if (nextParts.length === 0) {
        return [
            {
                isActive: false,
                isMatch: false,
                text: segment.displayText,
            },
        ]
    }

    return nextParts.filter((part) => part.text !== '')
}

export function ContentPanel({
    activeFile,
    activeState,
    externalSearchJump,
    onActivateTab,
    onConsumeSearchJump,
    onCloseAllTabs,
    onCloseTab,
    onCloseOtherTabs,
    onCloseTabsToRight,
    onReorderTabs,
    onSaveTab,
    onToggleTabLock,
    openTabs,
    editorStates,
    onChangeContent,
}) {
    const lineNumbersRef = useRef(null)
    const editorRef = useRef(null)
    const readonlyContentRef = useRef(null)
    const contextMenuRef = useRef(null)
    const readonlyMatchRefs = useRef({})
    const isLocked = activeState?.isLocked ?? true
    const content = activeState?.content || ''
    const lineCount = content.split('\n').length
    const lineNumbers = Array.from({ length: lineCount }, (_value, index) => index + 1)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeMatchIndex, setActiveMatchIndex] = useState(0)
    const [readonlyCopyBubble, setReadonlyCopyBubble] = useState(null)
    const [draggedTab, setDraggedTab] = useState('')
    const [dropTargetTab, setDropTargetTab] = useState('')
    const [dropTargetPlacement, setDropTargetPlacement] = useState('before')
    const [contextMenu, setContextMenu] = useState(null)
    const appliedJumpIdRef = useRef(null)

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

    const readonlySegments = useMemo(() => parseReadonlySegments(content), [content])

    useEffect(() => {
        setSearchTerm('')
        setActiveMatchIndex(0)
        setReadonlyCopyBubble(null)
        readonlyMatchRefs.current = {}
    }, [activeFile])

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

    useEffect(() => {
        if (contextMenu && !openTabs.includes(contextMenu.fileName)) {
            setContextMenu(null)
        }
    }, [contextMenu, openTabs])

    useEffect(() => {
        if (
            !externalSearchJump ||
            externalSearchJump.fileName !== activeFile ||
            appliedJumpIdRef.current === externalSearchJump.id
        ) {
            return
        }

        setSearchTerm(externalSearchJump.query)
    }, [activeFile, externalSearchJump])

    useEffect(() => {
        if (matches.length === 0) {
            setActiveMatchIndex(0)
            return
        }

        if (activeMatchIndex >= matches.length) {
            setActiveMatchIndex(0)
        }
    }, [activeMatchIndex, matches])

    useEffect(() => {
        if (
            !externalSearchJump ||
            externalSearchJump.fileName !== activeFile ||
            externalSearchJump.query !== searchTerm ||
            matches.length === 0 ||
            appliedJumpIdRef.current === externalSearchJump.id
        ) {
            return
        }

        const targetMatchIndex = matches.findIndex(
            (match) =>
                match.start === externalSearchJump.matchStart &&
                match.end === externalSearchJump.matchEnd
        )

        const nextMatchIndex = targetMatchIndex >= 0 ? targetMatchIndex : 0

        setActiveMatchIndex(nextMatchIndex)
        focusMatch(nextMatchIndex)
        appliedJumpIdRef.current = externalSearchJump.id
        onConsumeSearchJump(externalSearchJump.id)
    }, [
        activeFile,
        externalSearchJump,
        matches,
        onConsumeSearchJump,
        searchTerm,
    ])

    async function handleReadonlyTagClick(segment, event) {
        if (segment.type === 'link') {
            await window.localFiles.openLink(segment.value)
            return
        }

        await navigator.clipboard.writeText(segment.value)
        setReadonlyCopyBubble({
            label: 'Copied',
            x: event.clientX,
            y: event.clientY,
        })
        window.setTimeout(() => {
            setReadonlyCopyBubble(null)
        }, 900)
    }

    function handleTabDragStart(fileName, event) {
        setDraggedTab(fileName)
        setDropTargetTab(fileName)
        setDropTargetPlacement('before')
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', fileName)
    }

    function handleTabDragOver(fileName, event) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const tabBounds = event.currentTarget.getBoundingClientRect()
        const triggerOffset = Math.max(16, tabBounds.width * 0.3)
        const isBeforeZone = event.clientX <= tabBounds.left + triggerOffset
        const isAfterZone = event.clientX >= tabBounds.right - triggerOffset
        const nextPlacement = isAfterZone && !isBeforeZone ? 'after' : 'before'

        if (
            draggedTab &&
            draggedTab !== fileName &&
            (dropTargetTab !== fileName || dropTargetPlacement !== nextPlacement)
        ) {
            setDropTargetTab(fileName)
            setDropTargetPlacement(nextPlacement)
            onReorderTabs(draggedTab, fileName, nextPlacement)
        }
    }

    function handleTabDrop(fileName, event) {
        event.preventDefault()
        if (draggedTab) {
            onActivateTab(draggedTab)
        }
        setDraggedTab('')
        setDropTargetTab('')
        setDropTargetPlacement('before')
    }

    function handleTabDragEnd() {
        setDraggedTab('')
        setDropTargetTab('')
        setDropTargetPlacement('before')
    }

    function handleTabContextMenu(fileName, event) {
        event.preventDefault()
        setContextMenu({
            fileName,
            x: event.clientX,
            y: event.clientY,
        })
    }

    function handleContextMenuAction(action) {
        if (!contextMenu) {
            return
        }

        if (action === 'close-all') {
            onCloseAllTabs()
        }

        if (action === 'close-others') {
            onCloseOtherTabs(contextMenu.fileName)
        }

        if (action === 'close-right') {
            onCloseTabsToRight(contextMenu.fileName)
        }

        setContextMenu(null)
    }

    function handleReadonlyKeyDown(event) {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') {
            return
        }

        if (!readonlyContentRef.current) {
            return
        }

        event.preventDefault()
        const selection = window.getSelection()

        if (!selection) {
            return
        }

        const range = document.createRange()
        range.selectNodeContents(readonlyContentRef.current)
        selection.removeAllRanges()
        selection.addRange(range)
    }

    function focusMatch(matchIndex) {
        const match = matches[matchIndex]

        if (!match) {
            return
        }

        if (isLocked) {
            const matchElement = readonlyMatchRefs.current[matchIndex]

            if (matchElement) {
                matchElement.scrollIntoView({
                    block: 'center',
                })
            }

            return
        }

        if (!editorRef.current) {
            return
        }

        const textBeforeMatch = content.slice(0, match.start)
        const lineIndex = textBeforeMatch.split('\n').length - 1
        const computedStyle = window.getComputedStyle(editorRef.current)
        const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18
        const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0
        const targetScrollTop = Math.max(
            lineIndex * lineHeight - editorRef.current.clientHeight / 2 + lineHeight,
            0
        )

        editorRef.current.scrollTop = targetScrollTop + paddingTop
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

    function renderReadonlyPart(part, key) {
        if (!part.isMatch) {
            return <React.Fragment key={key}>{part.text}</React.Fragment>
        }

        return (
            <span
                key={key}
                className={
                    part.isActive
                        ? 'readonly-search-match is-active'
                        : 'readonly-search-match'
                }
                ref={(element) => {
                    if (element && part.matchIndex === activeMatchIndex) {
                        readonlyMatchRefs.current[part.matchIndex] = element
                    }
                }}
            >
                {part.text}
            </span>
        )
    }

    function renderReadonlySegment(segment, segmentIndex) {
        const parts = buildSegmentParts(segment, matches, activeMatchIndex)

        if (segment.type === 'text') {
            return (
                <React.Fragment key={`segment-${segmentIndex}`}>
                    {parts.map((part, partIndex) =>
                        renderReadonlyPart(part, `segment-${segmentIndex}-part-${partIndex}`)
                    )}
                </React.Fragment>
            )
        }

        return (
            <button
                key={`segment-${segmentIndex}`}
                className={`readonly-token readonly-token-${segment.type}`}
                onClick={(event) => {
                    handleReadonlyTagClick(segment, event)
                }}
                type="button"
            >
                {parts.map((part, partIndex) =>
                    renderReadonlyPart(part, `segment-${segmentIndex}-part-${partIndex}`)
                )}
            </button>
        )
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
                                className={[
                                    'content-tab',
                                    fileName === activeFile ? 'is-active' : '',
                                    draggedTab === fileName ? 'is-dragging' : '',
                                    dropTargetTab === fileName && draggedTab !== fileName
                                        ? 'is-drop-target'
                                        : '',
                                    dropTargetTab === fileName &&
                                    draggedTab !== fileName &&
                                    dropTargetPlacement === 'after'
                                        ? 'is-drop-after'
                                        : '',
                                    dropTargetTab === fileName &&
                                    draggedTab !== fileName &&
                                    dropTargetPlacement !== 'after'
                                        ? 'is-drop-before'
                                        : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                draggable
                                onContextMenu={(event) =>
                                    handleTabContextMenu(fileName, event)
                                }
                                onDragEnd={handleTabDragEnd}
                                onDragOver={(event) => handleTabDragOver(fileName, event)}
                                onDragStart={(event) => handleTabDragStart(fileName, event)}
                                onDrop={(event) => handleTabDrop(fileName, event)}
                                role="tab"
                            >
                                <button
                                    className="content-tab-label"
                                    onClick={() => onActivateTab(fileName)}
                                    type="button"
                                >
                                    {formatTabLabel(fileName)}
                                </button>
                                <div className="content-tab-actions">
                                    {tabDirty ? (
                                        <button
                                            aria-label={`Save ${fileName}`}
                                            className="content-tab-icon-button"
                                            onClick={() => onSaveTab(fileName)}
                                            type="button"
                                        >
                                            <i
                                                className="fa-solid fa-floppy-disk"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    ) : null}
                                    {fileName === activeFile ? (
                                        <button
                                            aria-label={
                                                tabLocked
                                                    ? `Unlock ${fileName}`
                                                    : `Lock ${fileName}`
                                            }
                                            className="content-tab-icon-button"
                                            onClick={() => onToggleTabLock(fileName)}
                                            type="button"
                                        >
                                            <i
                                                aria-hidden="true"
                                                className={
                                                    tabLocked
                                                        ? 'fa-solid fa-lock'
                                                        : 'fa-solid fa-unlock'
                                                }
                                            />
                                        </button>
                                    ) : null}
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
            {contextMenu ? (
                <div
                    className="tab-context-menu"
                    ref={contextMenuRef}
                    role="menu"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y,
                    }}
                >
                    <button
                        className="tab-context-menu-item"
                        disabled={openTabs.length <= 1}
                        onClick={() => handleContextMenuAction('close-others')}
                        role="menuitem"
                        type="button"
                    >
                        Close Other Tabs
                    </button>
                    <button
                        className="tab-context-menu-item"
                        disabled={
                            openTabs.indexOf(contextMenu.fileName) === openTabs.length - 1
                        }
                        onClick={() => handleContextMenuAction('close-right')}
                        role="menuitem"
                        type="button"
                    >
                        Close Tabs to the Right
                    </button>
                    <button
                        className="tab-context-menu-item danger"
                        disabled={openTabs.length === 0}
                        onClick={() => handleContextMenuAction('close-all')}
                        role="menuitem"
                        type="button"
                    >
                        Close All Tabs
                    </button>
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
                    {isLocked ? (
                        <>
                            <div
                                className="content-readonly"
                                onKeyDown={handleReadonlyKeyDown}
                                onScroll={(event) => {
                                    if (lineNumbersRef.current) {
                                        lineNumbersRef.current.scrollTop =
                                            event.target.scrollTop
                                    }
                                }}
                                ref={readonlyContentRef}
                                tabIndex={0}
                            >
                                {readonlySegments.map((segment, index) =>
                                    renderReadonlySegment(segment, index)
                                )}
                            </div>
                            {readonlyCopyBubble ? (
                                <div
                                    className="readonly-copy-bubble"
                                    style={{
                                        left: `${readonlyCopyBubble.x}px`,
                                        top: `${readonlyCopyBubble.y}px`,
                                    }}
                                >
                                    {readonlyCopyBubble.label}
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <textarea
                            ref={editorRef}
                            className="content-editor"
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
                    )}
                </div>
            ) : (
                <p className="message">No files found in local-data.</p>
            )}
        </section>
    )
}

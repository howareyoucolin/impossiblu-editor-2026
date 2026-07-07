import React, { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLanguage } from '@codemirror/lang-html'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { tags } from '@lezer/highlight'

const SPECIAL_TAG_PATTERN = /\[(copy|pass|link)=([^\]]*)\]/g
const SPACE_BLOCK_TAG = 'SPACE-BLOCK'
const HEADING_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
const INLINE_FORMATTING_TAGS = ['STRONG', 'EM', 'B', 'I', 'U', 'CODE']
const SKIPPED_HTML_TAGS = ['HEAD', 'LINK', 'META', 'SCRIPT', 'STYLE', 'TITLE']
const BLOCK_WRAPPER_TAGS = [
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DIV',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'HEADER',
    'MAIN',
    'NAV',
    'SECTION',
]
const BLOCK_LIKE_TAGS = [
    ...BLOCK_WRAPPER_TAGS,
    ...HEADING_TAGS,
    'BR',
    'LI',
    'OL',
    'P',
    'PRE',
    'TABLE',
    'TBODY',
    'TD',
    'TH',
    'THEAD',
    'TR',
    'UL',
    SPACE_BLOCK_TAG,
]
const htmlSourceHighlightStyle = HighlightStyle.define([
    {
        tag: [tags.angleBracket, tags.tagName, tags.attributeName, tags.attributeValue],
        color: '#93879a',
    },
    {
        tag: tags.comment,
        color: '#776b7d',
        fontStyle: 'italic',
    },
])

const VISUAL_BLOCK_TAGS = ['P', 'H1', 'PRE', SPACE_BLOCK_TAG]
const BLOCK_TYPE_OPTIONS = [
    { label: 'Convert to Text', tagName: 'P' },
    { label: 'Convert to Heading', tagName: 'H1' },
    { label: 'Convert to Code Block', tagName: 'PRE' },
]
const SPECIAL_TAG_OPTIONS = [
    { label: 'Convert to Copy Tag', tokenType: 'copy' },
    { label: 'Convert to Password Tag', tokenType: 'pass' },
    { label: 'Convert to Link Tag', tokenType: 'link' },
]

function formatTabLabel(fileName) {
    return fileName.length > 15 ? `${fileName.slice(0, 15)}...` : fileName
}

function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

function escapeHtmlAttribute(text) {
    return escapeHtml(text).replaceAll('"', '&quot;')
}

function convertPlainTextToHtml(text) {
    const normalizedText = text.replace(/\r\n?/g, '\n')
    const lines = normalizedText.split('\n')

    return (
        lines
            .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p><br /></p>'))
            .join('') || '<p><br /></p>'
    )
}

function normalizeTextContent(text) {
    return text.replace(/\u00a0/g, ' ')
}

function normalizeInlineChildren(node, options = {}) {
    return Array.from(node.childNodes)
        .map((childNode) => normalizeInlineNode(childNode, options))
        .join('')
}

function normalizeInlineNode(node, options = {}) {
    const { preserveLineBreaks = true } = options

    if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(normalizeTextContent(node.textContent || ''))
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return ''
    }

    const tagName = node.nodeName.toUpperCase()

    if (SKIPPED_HTML_TAGS.includes(tagName)) {
        return ''
    }

    if (tagName === SPACE_BLOCK_TAG) {
        return ''
    }

    if (tagName === 'BR') {
        return preserveLineBreaks ? '<br />' : ' '
    }

    if (INLINE_FORMATTING_TAGS.includes(tagName)) {
        const innerContent = normalizeInlineChildren(node, { preserveLineBreaks })

        if (!innerContent) {
            return ''
        }

        return `<${tagName.toLowerCase()}>${innerContent}</${tagName.toLowerCase()}>`
    }

    if (tagName === 'A') {
        const href = (node.getAttribute('href') || '').trim()
        const innerContent =
            normalizeInlineChildren(node, { preserveLineBreaks }) ||
            escapeHtml(normalizeTextContent(href || node.textContent || ''))

        if (!href) {
            return innerContent
        }

        return `<a href="${escapeHtmlAttribute(href)}">${innerContent}</a>`
    }

    if (tagName === 'IMG') {
        return escapeHtml(normalizeTextContent(node.getAttribute('alt') || ''))
    }

    return normalizeInlineChildren(node, { preserveLineBreaks })
}

function hasBlockLikeChildren(node) {
    return Array.from(node.childNodes).some((childNode) => {
        return (
            childNode.nodeType === Node.ELEMENT_NODE &&
            BLOCK_LIKE_TAGS.includes(childNode.nodeName.toUpperCase())
        )
    })
}

function normalizeListElement(node, { ordered = false, depth = 0 } = {}) {
    return Array.from(node.children).flatMap((childNode, index) => {
        if (childNode.nodeName.toUpperCase() !== 'LI') {
            return normalizeNodeToBlocks(childNode, { listDepth: depth })
        }

        const nestedBlocks = []
        const inlineContainer = document.createElement('div')

        Array.from(childNode.childNodes).forEach((grandchildNode) => {
            if (
                grandchildNode.nodeType === Node.ELEMENT_NODE &&
                ['UL', 'OL'].includes(grandchildNode.nodeName.toUpperCase())
            ) {
                nestedBlocks.push(
                    ...normalizeListElement(grandchildNode, {
                        depth: depth + 1,
                        ordered: grandchildNode.nodeName.toUpperCase() === 'OL',
                    })
                )
                return
            }

            inlineContainer.append(grandchildNode.cloneNode(true))
        })

        const prefix = ordered ? `${index + 1}. ` : '\u2022 '
        const indent = '&nbsp;'.repeat(depth * 4)
        const inlineContent = normalizeInlineChildren(inlineContainer, {
            preserveLineBreaks: true,
        }).trim()
        const currentBlock = `<p>${indent}${escapeHtml(prefix)}${inlineContent || '<br />'}</p>`

        return [currentBlock, ...nestedBlocks]
    })
}

function normalizeTableElement(node) {
    const rows = Array.from(node.querySelectorAll('tr')).map((rowNode) => {
        const cells = Array.from(rowNode.children)
            .filter((cellNode) => ['TH', 'TD'].includes(cellNode.nodeName.toUpperCase()))
            .map((cellNode) =>
                normalizeInlineChildren(cellNode, { preserveLineBreaks: false }).trim()
            )
            .filter(Boolean)

        if (cells.length === 0) {
            return ''
        }

        return `<p>${cells.join(' | ')}</p>`
    })

    return rows.filter(Boolean)
}

function normalizeNodeToBlocks(node, options = {}) {
    const { listDepth = 0 } = options

    if (node.nodeType === Node.TEXT_NODE) {
        const textContent = normalizeTextContent(node.textContent || '')

        if (!textContent.trim()) {
            return []
        }

        return convertPlainTextToHtml(textContent)
            .match(/<p>[\s\S]*?<\/p>/g) || []
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return []
    }

    const tagName = node.nodeName.toUpperCase()

    if (SKIPPED_HTML_TAGS.includes(tagName)) {
        return []
    }

    if (tagName === SPACE_BLOCK_TAG) {
        return ['<space-block></space-block>']
    }

    if (tagName === 'P') {
        return [`<p>${normalizeInlineChildren(node, { preserveLineBreaks: true }).trim() || '<br />'}</p>`]
    }

    if (tagName === 'H1' || HEADING_TAGS.includes(tagName)) {
        return [`<h1>${normalizeInlineChildren(node, { preserveLineBreaks: true }).trim() || '<br />'}</h1>`]
    }

    if (tagName === 'PRE') {
        const preformattedText = escapeHtml(normalizeTextContent(node.textContent || ''))
        return [`<pre>${preformattedText.replace(/\n/g, '<br />') || '<br />'}</pre>`]
    }

    if (tagName === 'BR') {
        return ['<p><br /></p>']
    }

    if (tagName === 'UL' || tagName === 'OL') {
        return normalizeListElement(node, {
            depth: listDepth,
            ordered: tagName === 'OL',
        })
    }

    if (tagName === 'TABLE') {
        return normalizeTableElement(node)
    }

    if (BLOCK_WRAPPER_TAGS.includes(tagName) || tagName === 'LI') {
        if (hasBlockLikeChildren(node)) {
            return Array.from(node.childNodes).flatMap((childNode) =>
                normalizeNodeToBlocks(childNode, { listDepth })
            )
        }

        return [`<p>${normalizeInlineChildren(node, { preserveLineBreaks: true }).trim() || '<br />'}</p>`]
    }

    return [`<p>${normalizeInlineChildren(node, { preserveLineBreaks: true }).trim() || '<br />'}</p>`]
}

function createSpecialTokenNode(
    type,
    value,
    { isPasswordVisible = false, mode = 'visual', tokenKey = '' } = {}
) {
    const displayValue = type === 'pass' && mode === 'readonly' && !isPasswordVisible
        ? '••••••••'
        : value

    if (type === 'link') {
        const linkElement = document.createElement('a')
        linkElement.className = 'special-token special-token-link'
        linkElement.href = value
        linkElement.target = '_blank'
        linkElement.rel = 'noreferrer'
        linkElement.dataset.tokenType = type
        linkElement.dataset.tokenValue = value
        linkElement.contentEditable = 'false'
        linkElement.textContent = value
        return linkElement
    }

    const tokenElement = document.createElement('span')
    tokenElement.className = `special-token special-token-${type}`
    tokenElement.dataset.tokenType = type
    tokenElement.dataset.tokenValue = value
    tokenElement.contentEditable = 'false'

    if (type === 'pass' && mode === 'readonly') {
        tokenElement.classList.add('readonly-pass-token')
        tokenElement.dataset.tokenKey = tokenKey

        const valueElement = document.createElement('span')
        valueElement.className = 'readonly-pass-value'
        valueElement.textContent = displayValue
        tokenElement.append(valueElement)

        const toggleButton = document.createElement('button')
        toggleButton.type = 'button'
        toggleButton.className = 'readonly-pass-toggle'
        toggleButton.dataset.tokenKey = tokenKey
        toggleButton.setAttribute(
            'aria-label',
            isPasswordVisible ? 'Hide password' : 'Show password'
        )

        const iconElement = document.createElement('i')
        iconElement.className = isPasswordVisible
            ? 'fa-solid fa-eye-slash'
            : 'fa-solid fa-eye'
        iconElement.setAttribute('aria-hidden', 'true')
        toggleButton.append(iconElement)
        tokenElement.append(toggleButton)
        return tokenElement
    }

    tokenElement.textContent = displayValue
    return tokenElement
}

function decorateSpecialTokens(html, options = {}) {
    if (typeof document === 'undefined') {
        return html
    }

    const { mode = 'visual', revealedPasswordKeys = new Set() } = options

    const container = document.createElement('div')
    container.innerHTML = html
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const textNodes = []
    let tokenIndex = 0

    while (walker.nextNode()) {
        const currentNode = walker.currentNode

        if (
            currentNode.parentElement?.closest('[data-token-type]') ||
            !currentNode.textContent?.includes('[')
        ) {
            continue
        }

        textNodes.push(currentNode)
    }

    textNodes.forEach((textNode) => {
        const fragment = document.createDocumentFragment()
        const sourceText = textNode.textContent || ''
        let lastIndex = 0
        let match

        SPECIAL_TAG_PATTERN.lastIndex = 0

        while ((match = SPECIAL_TAG_PATTERN.exec(sourceText)) !== null) {
            const [rawText, type, value] = match
            const matchStart = match.index
            const tokenKey = `${type}:${value}:${tokenIndex}`

            if (matchStart > lastIndex) {
                fragment.append(sourceText.slice(lastIndex, matchStart))
            }

            fragment.append(
                createSpecialTokenNode(type, value, {
                    isPasswordVisible: revealedPasswordKeys.has(tokenKey),
                    mode,
                    tokenKey,
                })
            )
            lastIndex = matchStart + rawText.length
            tokenIndex += 1
        }

        if (lastIndex === 0) {
            return
        }

        if (lastIndex < sourceText.length) {
            fragment.append(sourceText.slice(lastIndex))
        }

        textNode.replaceWith(fragment)
    })

    return container.innerHTML
}

function highlightReadonlyMatches(html, matches, activeMatchIndex) {
    if (typeof document === 'undefined' || matches.length === 0) {
        return html
    }

    const container = document.createElement('div')
    container.innerHTML = html
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const textNodes = []
    let currentOffset = 0

    while (walker.nextNode()) {
        const textNode = walker.currentNode
        const textContent = textNode.textContent || ''

        if (!textContent) {
            continue
        }

        textNodes.push({
            end: currentOffset + textContent.length,
            node: textNode,
            start: currentOffset,
        })
        currentOffset += textContent.length
    }

    textNodes.forEach(({ node, start, end }) => {
        const overlappingMatches = matches.filter((match) => match.start < end && match.end > start)

        if (overlappingMatches.length === 0) {
            return
        }

        const fragment = document.createDocumentFragment()
        const textContent = node.textContent || ''
        let cursor = 0

        overlappingMatches.forEach((match) => {
            const localStart = Math.max(match.start - start, 0)
            const localEnd = Math.min(match.end - start, textContent.length)

            if (localStart > cursor) {
                fragment.append(textContent.slice(cursor, localStart))
            }

            const matchElement = document.createElement('span')
            matchElement.className =
                match.index === activeMatchIndex
                    ? 'readonly-search-match is-active'
                    : 'readonly-search-match'
            matchElement.textContent = textContent.slice(localStart, localEnd)
            fragment.append(matchElement)
            cursor = localEnd
        })

        if (cursor < textContent.length) {
            fragment.append(textContent.slice(cursor))
        }

        node.replaceWith(fragment)
    })

    return container.innerHTML
}

function serializeDecoratedHtml(html) {
    if (typeof document === 'undefined') {
        return html
    }

    const container = document.createElement('div')
    container.innerHTML = html

    container.querySelectorAll('[data-token-type]').forEach((tokenElement) => {
        const type = tokenElement.getAttribute('data-token-type') || ''
        const value = tokenElement.getAttribute('data-token-value') || ''

        tokenElement.replaceWith(document.createTextNode(`[${type}=${value}]`))
    })

    return container.innerHTML
}

function normalizeEditorHtml(content) {
    if (!content.trim()) {
        return '<p><br /></p>'
    }

    if (!/<\/?[a-z][\s\S]*>/i.test(content)) {
        return convertPlainTextToHtml(content)
    }

    if (typeof document === 'undefined') {
        return content
    }

    const container = document.createElement('div')
    container.innerHTML = content

    const blocks = Array.from(container.childNodes).flatMap((node) =>
        normalizeNodeToBlocks(node)
    )

    return blocks.join('') || '<p><br /></p>'
}

function getPlainTextFromHtml(content) {
    if (typeof document === 'undefined') {
        return content.replace(/<[^>]+>/g, '')
    }

    const container = document.createElement('div')
    container.innerHTML = decorateSpecialTokens(normalizeEditorHtml(content))
    return container.textContent || container.innerText || ''
}

export function ContentPanel({
    activeFile,
    activeState,
    onDiscardChanges,
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
    const editSurfaceRef = useRef(null)
    const searchInputRef = useRef(null)
    const readonlyContentRef = useRef(null)
    const contextMenuRef = useRef(null)
    const blockMenuRef = useRef(null)
    const specialTagMenuRef = useRef(null)
    const hoveredBlockRef = useRef(null)
    const selectedTokenRef = useRef(null)
    const selectionRangeRef = useRef(null)
    const insertionTargetRef = useRef(null)
    const isLocked = activeState?.isLocked ?? true
    const content = activeState?.content || ''
    const [searchTerm, setSearchTerm] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [activeMatchIndex, setActiveMatchIndex] = useState(0)
    const [copyBubble, setCopyBubble] = useState(null)
    const [revealedPasswordKeys, setRevealedPasswordKeys] = useState(() => new Set())
    const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false)
    const [draggedTab, setDraggedTab] = useState('')
    const [dropTargetTab, setDropTargetTab] = useState('')
    const [dropTargetPlacement, setDropTargetPlacement] = useState('before')
    const [contextMenu, setContextMenu] = useState(null)
    const [editorMode, setEditorMode] = useState('visual')
    const [blockMenu, setBlockMenu] = useState({
        insertMode: false,
        tagName: 'P',
        x: 0,
        y: 0,
        visible: false,
    })
    const [specialTagMenu, setSpecialTagMenu] = useState({
        hasSelection: false,
        tokenType: '',
        visible: false,
        x: 0,
        y: 0,
    })
    const appliedJumpIdRef = useRef(null)
    const normalizedHtmlContent = useMemo(() => normalizeEditorHtml(content), [content])
    const visualDecoratedHtmlContent = useMemo(
        () => decorateSpecialTokens(normalizedHtmlContent, { mode: 'visual' }),
        [normalizedHtmlContent]
    )
    const readonlyDecoratedHtmlContent = useMemo(
        () =>
            decorateSpecialTokens(normalizedHtmlContent, {
                mode: 'readonly',
                revealedPasswordKeys,
            }),
        [normalizedHtmlContent, revealedPasswordKeys]
    )
    const searchableContent = useMemo(() => getPlainTextFromHtml(content), [content])

    const matches = useMemo(() => {
        if (!searchTerm) {
            return []
        }

        const lowerContent = searchableContent.toLowerCase()
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
    }, [searchTerm, searchableContent]).map((match, index) => ({
        ...match,
        index,
    }))
    const readonlySearchHtml = useMemo(
        () => highlightReadonlyMatches(readonlyDecoratedHtmlContent, matches, activeMatchIndex),
        [activeMatchIndex, matches, readonlyDecoratedHtmlContent]
    )

    useEffect(() => {
        setSearchTerm('')
        setIsSearchOpen(false)
        setActiveMatchIndex(0)
        setCopyBubble(null)
        setRevealedPasswordKeys(new Set())
        setIsDiscardConfirmOpen(false)
        setEditorMode('visual')
        hoveredBlockRef.current = null
        setBlockMenu({
            insertMode: false,
            tagName: 'P',
            x: 0,
            y: 0,
            visible: false,
        })
        setSpecialTagMenu({
            hasSelection: false,
            tokenType: '',
            visible: false,
            x: 0,
            y: 0,
        })
        selectedTokenRef.current = null
        selectionRangeRef.current = null
        insertionTargetRef.current = null
    }, [activeFile])

    useEffect(() => {
        if (!activeState?.isDirty) {
            setIsDiscardConfirmOpen(false)
        }
    }, [activeState?.isDirty])

    useEffect(() => {
        if (!isLocked && editorMode === 'visual' && editSurfaceRef.current) {
            if (
                document.activeElement !== editSurfaceRef.current &&
                editSurfaceRef.current.innerHTML !== visualDecoratedHtmlContent
            ) {
                editSurfaceRef.current.innerHTML = visualDecoratedHtmlContent
            }
        }
    }, [editorMode, isLocked, visualDecoratedHtmlContent])

    useEffect(() => {
        if (!activeFile) {
            return undefined
        }

        function handleWindowKeyDown(event) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault()
                setIsSearchOpen(true)
                return
            }

            if (event.key === 'Escape') {
                setIsSearchOpen(false)
            }
        }

        window.addEventListener('keydown', handleWindowKeyDown)

        return () => {
            window.removeEventListener('keydown', handleWindowKeyDown)
        }
    }, [activeFile])

    useEffect(() => {
        if (isSearchOpen) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
        }
    }, [isSearchOpen])

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
        if (!blockMenu.visible) {
            return undefined
        }

        function handleWindowPointerDown(event) {
            if (blockMenuRef.current?.contains(event.target)) {
                return
            }

            setBlockMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
        }

        function handleWindowKeyDown(event) {
            if (event.key === 'Escape') {
                setBlockMenu((currentState) => ({
                    ...currentState,
                    visible: false,
                }))
            }
        }

        window.addEventListener('pointerdown', handleWindowPointerDown)
        window.addEventListener('keydown', handleWindowKeyDown)

        return () => {
            window.removeEventListener('pointerdown', handleWindowPointerDown)
            window.removeEventListener('keydown', handleWindowKeyDown)
        }
    }, [blockMenu.visible])

    useEffect(() => {
        if (!specialTagMenu.visible) {
            return undefined
        }

        function handleWindowPointerDown(event) {
            if (specialTagMenuRef.current?.contains(event.target)) {
                return
            }

            setSpecialTagMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
        }

        function handleWindowKeyDown(event) {
            if (event.key === 'Escape') {
                setSpecialTagMenu((currentState) => ({
                    ...currentState,
                    visible: false,
                }))
            }
        }

        window.addEventListener('pointerdown', handleWindowPointerDown)
        window.addEventListener('keydown', handleWindowKeyDown)

        return () => {
            window.removeEventListener('pointerdown', handleWindowPointerDown)
            window.removeEventListener('keydown', handleWindowKeyDown)
        }
    }, [specialTagMenu.visible])

    useEffect(() => {
        if (
            !externalSearchJump ||
            externalSearchJump.fileName !== activeFile ||
            appliedJumpIdRef.current === externalSearchJump.id
        ) {
            return
        }

        setIsSearchOpen(true)
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
        if (!isSearchOpen || matches.length === 0) {
            return
        }

        focusMatch(activeMatchIndex)
    }, [activeMatchIndex, isSearchOpen, matches, readonlySearchHtml])

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

    function handleCloseSearch() {
        setIsSearchOpen(false)
        setSearchTerm('')
        setActiveMatchIndex(0)
    }

    function syncEditSurfaceContent() {
        if (!editSurfaceRef.current) {
            return
        }

        onChangeContent(
            normalizeEditorHtml(serializeDecoratedHtml(editSurfaceRef.current.innerHTML))
        )
    }

    function handleEditSurfacePaste(event) {
        const clipboardData = event.clipboardData

        if (!clipboardData) {
            return
        }

        const pastedHtml = clipboardData.getData('text/html')
        const pastedText = clipboardData.getData('text/plain')
        const clipboardContent = pastedHtml || pastedText

        if (!clipboardContent) {
            return
        }

        event.preventDefault()

        const normalizedPasteHtml = normalizeEditorHtml(clipboardContent)
        const pasteContainer = document.createElement('div')
        pasteContainer.innerHTML = normalizedPasteHtml

        const pasteBlocks = Array.from(pasteContainer.children)
        const insertionHtml =
            pasteBlocks.length === 1 && pasteBlocks[0].nodeName === 'P'
                ? pasteBlocks[0].innerHTML || '<br />'
                : normalizedPasteHtml

        document.execCommand('insertHTML', false, insertionHtml)
        syncEditSurfaceContent()
    }

    async function handleSpecialTokenClick(event) {
        const tokenElement = event.target.closest('[data-token-type]')

        if (!tokenElement) {
            return
        }

        const tokenType = tokenElement.getAttribute('data-token-type')
        const tokenValue = tokenElement.getAttribute('data-token-value') || ''

        if (!tokenType || !tokenValue) {
            return
        }

        event.preventDefault()
        event.stopPropagation()

        if (tokenType === 'pass') {
            const toggleButton = event.target.closest('.readonly-pass-toggle')

            if (toggleButton) {
                const tokenKey = toggleButton.getAttribute('data-token-key') || ''

                if (tokenKey) {
                    setRevealedPasswordKeys((currentKeys) => {
                        const nextKeys = new Set(currentKeys)

                        if (nextKeys.has(tokenKey)) {
                            nextKeys.delete(tokenKey)
                        } else {
                            nextKeys.add(tokenKey)
                        }

                        return nextKeys
                    })
                }

                return
            }
        }

        if (tokenType === 'link') {
            await window.localFiles.openLink(tokenValue)
            return
        }

        await navigator.clipboard.writeText(tokenValue)
        setCopyBubble({
            label: 'Copied',
            x: event.clientX,
            y: event.clientY,
        })
        window.setTimeout(() => {
            setCopyBubble(null)
        }, 900)
    }

    function closeSpecialTagMenu() {
        setSpecialTagMenu((currentState) => ({
            ...currentState,
            visible: false,
        }))
    }

    function replaceTokenElement(tokenElement, tokenType, tokenValue) {
        const nextTokenElement = createSpecialTokenNode(tokenType, tokenValue)
        tokenElement.replaceWith(nextTokenElement)
        selectedTokenRef.current = nextTokenElement
        syncEditSurfaceContent()
        return nextTokenElement
    }

    function clearSelectedSpecialToken() {
        const tokenElement = selectedTokenRef.current

        if (!tokenElement) {
            return
        }

        const tokenValue = tokenElement.getAttribute('data-token-value') || ''
        tokenElement.replaceWith(document.createTextNode(tokenValue))
        selectedTokenRef.current = null
        syncEditSurfaceContent()
        closeSpecialTagMenu()
        editSurfaceRef.current?.focus()
    }

    function convertSelectedToken(tokenType) {
        const tokenElement = selectedTokenRef.current

        if (!tokenElement) {
            return
        }

        const tokenValue = tokenElement.getAttribute('data-token-value') || ''
        replaceTokenElement(tokenElement, tokenType, tokenValue)
        closeSpecialTagMenu()
        editSurfaceRef.current?.focus()
    }

    function convertSelectionToSpecialTag(tokenType) {
        const range = selectionRangeRef.current

        if (!range || range.collapsed) {
            return
        }

        const selectedText = range.toString()

        if (!selectedText.trim()) {
            return
        }

        const nextTokenElement = createSpecialTokenNode(tokenType, selectedText)
        range.deleteContents()
        range.insertNode(nextTokenElement)
        selectedTokenRef.current = nextTokenElement
        selectionRangeRef.current = null
        syncEditSurfaceContent()
        closeSpecialTagMenu()
        placeCaretAfter(nextTokenElement)
        editSurfaceRef.current?.focus()
    }

    function getRangeFromPoint(x, y) {
        if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(x, y)

            if (!position) {
                return null
            }

            const range = document.createRange()
            range.setStart(position.offsetNode, position.offset)
            range.collapse(true)
            return range
        }

        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y)
        }

        return null
    }

    function getTopLevelVisualBlock(node) {
        let currentNode =
            node?.nodeType === Node.TEXT_NODE ? node.parentElement : node

        while (currentNode && currentNode.parentNode !== editSurfaceRef.current) {
            currentNode = currentNode.parentNode
        }

        if (
            currentNode &&
            currentNode.parentNode === editSurfaceRef.current &&
            VISUAL_BLOCK_TAGS.includes(currentNode.nodeName)
        ) {
            return currentNode
        }

        return null
    }

    function getInsertionTarget(x, y) {
        if (!editSurfaceRef.current) {
            return null
        }

        const topLevelBlocks = Array.from(editSurfaceRef.current.children).filter((child) =>
            VISUAL_BLOCK_TAGS.includes(child.nodeName)
        )

        if (topLevelBlocks.length === 0) {
            return {
                block: null,
                placement: 'append',
            }
        }

        const firstBlockRect = topLevelBlocks[0].getBoundingClientRect()

        if (y < firstBlockRect.top) {
            return {
                block: topLevelBlocks[0],
                placement: 'before',
            }
        }

        for (let index = 0; index < topLevelBlocks.length; index += 1) {
            const currentBlock = topLevelBlocks[index]
            const currentRect = currentBlock.getBoundingClientRect()
            const nextBlock = topLevelBlocks[index + 1]

            if (y >= currentRect.top && y <= currentRect.bottom) {
                return {
                    block: currentBlock,
                    placement: y < currentRect.top + currentRect.height / 2 ? 'before' : 'after',
                }
            }

            if (!nextBlock) {
                continue
            }

            const nextRect = nextBlock.getBoundingClientRect()

            if (y > currentRect.bottom && y < nextRect.top) {
                const gapMidpoint = currentRect.bottom + (nextRect.top - currentRect.bottom) / 2

                return {
                    block: y < gapMidpoint ? currentBlock : nextBlock,
                    placement: y < gapMidpoint ? 'after' : 'before',
                }
            }
        }

        const lastBlock = topLevelBlocks[topLevelBlocks.length - 1]
        const fallbackRange = getRangeFromPoint(x, y)
        const fallbackBlock = fallbackRange
            ? getTopLevelVisualBlock(fallbackRange.startContainer)
            : null

        if (fallbackBlock) {
            const fallbackRect = fallbackBlock.getBoundingClientRect()

            return {
                block: fallbackBlock,
                placement: y < fallbackRect.top + fallbackRect.height / 2 ? 'before' : 'after',
            }
        }

        return {
            block: lastBlock,
            placement: 'after',
        }
    }

    function insertEmptySpaceBlock() {
        if (!editSurfaceRef.current) {
            return
        }

        const spaceBlock = document.createElement('space-block')
        const insertionTarget = insertionTargetRef.current

        if (insertionTarget?.block) {
            if (insertionTarget.placement === 'before') {
                insertionTarget.block.insertAdjacentElement('beforebegin', spaceBlock)
            } else {
                insertionTarget.block.insertAdjacentElement('afterend', spaceBlock)
            }
        } else {
            editSurfaceRef.current.append(spaceBlock)
        }

        insertionTargetRef.current = null
        setBlockMenu((currentState) => ({
            ...currentState,
            insertMode: false,
            visible: false,
        }))
        syncEditSurfaceContent()
        placeCaretAfter(spaceBlock)
        editSurfaceRef.current.focus()
    }

    function getCurrentBlockElement() {
        const selection = window.getSelection()

        if (!selection || selection.rangeCount === 0) {
            return null
        }

        let currentNode = selection.anchorNode

        while (currentNode && currentNode !== editSurfaceRef.current) {
            if (
                currentNode.nodeType === Node.ELEMENT_NODE &&
                VISUAL_BLOCK_TAGS.includes(currentNode.nodeName)
            ) {
                return currentNode
            }

            currentNode = currentNode.parentNode
        }

        return null
    }

    function replaceBlockTag(tagName) {
        const blockElement = hoveredBlockRef.current

        if (!blockElement || !editSurfaceRef.current) {
            return
        }

        if (blockElement.nodeName === tagName) {
            setBlockMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
            return
        }

        const nextBlock = document.createElement(tagName.toLowerCase())
        nextBlock.innerHTML = blockElement.innerHTML
        blockElement.replaceWith(nextBlock)
        hoveredBlockRef.current = nextBlock
        setBlockMenu((currentState) => ({
            ...currentState,
            tagName,
            visible: false,
        }))
        syncEditSurfaceContent()
        placeCaretAtStart(nextBlock)
        editSurfaceRef.current.focus()
    }

    function placeCaretAtStart(element) {
        const selection = window.getSelection()

        if (!selection) {
            return
        }

        const range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
    }

    function placeCaretAfter(element) {
        const selection = window.getSelection()

        if (!selection) {
            return
        }

        const range = document.createRange()
        range.setStartAfter(element)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
    }

    function handleEditSurfaceKeyDown(event) {
        if (event.key !== 'Enter') {
            return
        }

        event.preventDefault()

        if (event.shiftKey) {
            document.execCommand('insertLineBreak', false)
            syncEditSurfaceContent()
            return
        }

        const selection = window.getSelection()
        const currentParagraph = getCurrentBlockElement()

        if (!selection || selection.rangeCount === 0 || !currentParagraph) {
            return
        }

        const currentRange = selection.getRangeAt(0)
        const trailingRange = currentRange.cloneRange()
        trailingRange.setEndAfter(currentParagraph)
        const trailingContent = trailingRange.extractContents()
        const nextParagraph = document.createElement('p')

        if (
            trailingContent.childNodes.length === 0 ||
            (!(trailingContent.textContent || '').trim() &&
                !trailingContent.querySelector('br'))
        ) {
            nextParagraph.innerHTML = '<br />'
        } else {
            nextParagraph.appendChild(trailingContent)
        }

        if (!(currentParagraph.textContent || '').trim() && !currentParagraph.querySelector('br')) {
            currentParagraph.innerHTML = '<br />'
        }

        currentParagraph.parentNode.insertBefore(nextParagraph, currentParagraph.nextSibling)
        placeCaretAtStart(nextParagraph)
        syncEditSurfaceContent()
    }

    function focusMatch(matchIndex) {
        const match = matches[matchIndex]

        if (!match) {
            return
        }

        if (isLocked) {
            const matchElements =
                readonlyContentRef.current?.querySelectorAll('.readonly-search-match')
            const activeMatchElement = matchElements?.[matchIndex]

            activeMatchElement?.scrollIntoView({
                block: 'center',
                behavior: 'smooth',
            })
            return
        }

        if (editorMode !== 'source') {
            return
        }
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

    function handleEditSurfaceContextMenu(event) {
        const targetElement =
            event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target
        const tokenElement = targetElement?.closest('[data-token-type]')
        const selection = window.getSelection()
        const hasSelection =
            !!selection &&
            selection.rangeCount > 0 &&
            !selection.getRangeAt(0).collapsed &&
            editSurfaceRef.current?.contains(
                selection.getRangeAt(0).commonAncestorContainer.nodeType === Node.TEXT_NODE
                    ? selection.getRangeAt(0).commonAncestorContainer.parentElement
                    : selection.getRangeAt(0).commonAncestorContainer
            )

        if (tokenElement) {
            event.preventDefault()
            selectedTokenRef.current = tokenElement
            selectionRangeRef.current = null
            setSpecialTagMenu({
                hasSelection: false,
                tokenType: tokenElement.getAttribute('data-token-type') || '',
                visible: true,
                x: event.clientX,
                y: event.clientY,
            })
            setBlockMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
            return
        }

        if (hasSelection) {
            event.preventDefault()
            selectedTokenRef.current = null
            selectionRangeRef.current = selection.getRangeAt(0).cloneRange()
            setSpecialTagMenu({
                hasSelection: true,
                tokenType: '',
                visible: true,
                x: event.clientX,
                y: event.clientY,
            })
            setBlockMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
            return
        }

        const blockElement = targetElement?.closest('p, h1, pre')

        if (!blockElement || !editSurfaceRef.current?.contains(blockElement)) {
            if (!editSurfaceRef.current?.contains(targetElement)) {
                return
            }

            event.preventDefault()
            hoveredBlockRef.current = null
            selectedTokenRef.current = null
            selectionRangeRef.current = null
            insertionTargetRef.current = getInsertionTarget(event.clientX, event.clientY)
            setBlockMenu({
                insertMode: true,
                tagName: '',
                x: event.clientX,
                y: event.clientY,
                visible: true,
            })
            setSpecialTagMenu((currentState) => ({
                ...currentState,
                visible: false,
            }))
            return
        }

        event.preventDefault()
        hoveredBlockRef.current = blockElement
        setBlockMenu({
            insertMode: false,
            tagName: blockElement.nodeName,
            x: event.clientX,
            y: event.clientY,
            visible: true,
        })
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
            {specialTagMenu.visible ? (
                <div
                    className="tab-context-menu visual-block-context-menu"
                    ref={specialTagMenuRef}
                    style={{
                        left: specialTagMenu.x,
                        top: specialTagMenu.y,
                    }}
                >
                    {SPECIAL_TAG_OPTIONS.map((option) => (
                        <button
                            key={option.tokenType}
                            className={
                                option.tokenType === specialTagMenu.tokenType
                                    ? 'tab-context-menu-item visual-block-menu-item is-active'
                                    : 'tab-context-menu-item visual-block-menu-item'
                            }
                            onMouseDown={(event) => {
                                event.preventDefault()
                                if (specialTagMenu.hasSelection) {
                                    convertSelectionToSpecialTag(option.tokenType)
                                    return
                                }

                                convertSelectedToken(option.tokenType)
                            }}
                            type="button"
                        >
                            {option.label}
                        </button>
                    ))}
                    <button
                        className="tab-context-menu-item visual-block-menu-item"
                        disabled={specialTagMenu.hasSelection}
                        onMouseDown={(event) => {
                            event.preventDefault()
                            clearSelectedSpecialToken()
                        }}
                        type="button"
                    >
                        Clear Special Tag
                    </button>
                </div>
            ) : null}
            {activeFile ? (
                <div
                    className={[
                        'editor-shell',
                        'is-single-column',
                        isLocked ? 'is-readonly-mode' : '',
                        !isLocked && editorMode === 'visual' ? 'is-visual-mode' : '',
                        !isLocked && editorMode === 'source' ? 'is-source-mode' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                >
                    {!isLocked && editorMode === 'visual' ? (
                        <div className="content-readonly-frame" aria-hidden="true">
                            <span className="content-readonly-corner corner-top-left" />
                            <span className="content-readonly-corner corner-top-right" />
                            <span className="content-readonly-corner corner-bottom-left" />
                            <span className="content-readonly-corner corner-bottom-right" />
                        </div>
                    ) : null}
                    {isSearchOpen ? (
                        <div className="content-search content-search-inline">
                            <input
                                ref={searchInputRef}
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
                            <button
                                aria-label="Close search"
                                className="content-search-button content-search-close"
                                onClick={handleCloseSearch}
                                type="button"
                            >
                                x
                            </button>
                        </div>
                    ) : null}
                    {!isLocked ? (
                        <div className="content-mode-switch" role="tablist" aria-label="Editor mode">
                            <button
                                className={
                                    editorMode === 'visual'
                                        ? 'content-mode-button is-active'
                                        : 'content-mode-button'
                                }
                                onClick={() => setEditorMode('visual')}
                                role="tab"
                                type="button"
                            >
                                Visual
                            </button>
                            <button
                                className={
                                    editorMode === 'source'
                                        ? 'content-mode-button is-active'
                                        : 'content-mode-button'
                                }
                                onClick={() => setEditorMode('source')}
                                role="tab"
                                type="button"
                            >
                                Source
                            </button>
                        </div>
                    ) : null}
                    {isLocked ? (
                        <div
                            className="content-readonly html-content-surface"
                            dangerouslySetInnerHTML={{ __html: readonlySearchHtml }}
                            onClick={handleSpecialTokenClick}
                            onKeyDown={handleReadonlyKeyDown}
                            ref={readonlyContentRef}
                            tabIndex={0}
                        />
                    ) : editorMode === 'visual' ? (
                        <>
                            {blockMenu.visible ? (
                                <div
                                    className="tab-context-menu visual-block-context-menu"
                                    ref={blockMenuRef}
                                    style={{
                                        left: blockMenu.x,
                                        top: blockMenu.y,
                                    }}
                                >
                                    {blockMenu.insertMode ? (
                                        <button
                                            className="tab-context-menu-item visual-block-menu-item"
                                            onClick={insertEmptySpaceBlock}
                                            type="button"
                                        >
                                            Add Empty Space Block
                                        </button>
                                    ) : (
                                        BLOCK_TYPE_OPTIONS.map((option) => (
                                            <button
                                                key={option.tagName}
                                                className={
                                                    option.tagName === blockMenu.tagName
                                                        ? 'tab-context-menu-item visual-block-menu-item is-active'
                                                        : 'tab-context-menu-item visual-block-menu-item'
                                                }
                                                onClick={() => replaceBlockTag(option.tagName)}
                                                type="button"
                                            >
                                                {option.label}
                                            </button>
                                        ))
                                    )}
                                </div>
                            ) : null}
                            <div
                                ref={editSurfaceRef}
                                className="content-edit-surface html-content-surface"
                                contentEditable
                                onClick={handleSpecialTokenClick}
                                onPaste={handleEditSurfacePaste}
                                onInput={syncEditSurfaceContent}
                                onContextMenu={handleEditSurfaceContextMenu}
                                onKeyDown={handleEditSurfaceKeyDown}
                                spellCheck={false}
                                suppressContentEditableWarning
                            />
                        </>
                    ) : (
                        <CodeMirror
                            basicSetup={{
                                foldGutter: false,
                                highlightActiveLine: false,
                                highlightActiveLineGutter: false,
                            }}
                            className="content-code-editor"
                            extensions={[
                                htmlLanguage(),
                                Prec.highest(syntaxHighlighting(htmlSourceHighlightStyle)),
                            ]}
                            height="100%"
                            onChange={(value) => onChangeContent(value)}
                            theme={oneDark}
                            value={content}
                        />
                    )}
                    {copyBubble ? (
                        <div
                            className="readonly-copy-bubble"
                            style={{
                                left: `${copyBubble.x}px`,
                                top: `${copyBubble.y}px`,
                            }}
                        >
                            {copyBubble.label}
                        </div>
                    ) : null}
                    {!isLocked && activeState?.isDirty ? (
                        <div className="content-discard-control">
                            {isDiscardConfirmOpen ? (
                                <div className="content-discard-popover" role="dialog">
                                    <p className="content-discard-text">
                                        Discard unsaved changes?
                                    </p>
                                    <div className="content-discard-actions">
                                        <button
                                            className="content-discard-button danger"
                                            onClick={() => {
                                                onDiscardChanges(activeFile)
                                                setIsDiscardConfirmOpen(false)
                                            }}
                                            type="button"
                                        >
                                            Discard
                                        </button>
                                        <button
                                            className="content-discard-button"
                                            onClick={() => setIsDiscardConfirmOpen(false)}
                                            type="button"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            <button
                                aria-label="Discard unsaved changes"
                                className="content-discard-trigger"
                                onClick={() =>
                                    setIsDiscardConfirmOpen((currentState) => !currentState)
                                }
                                type="button"
                            >
                                <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : (
                <p className="message">No files found in local-data.</p>
            )}
        </section>
    )
}

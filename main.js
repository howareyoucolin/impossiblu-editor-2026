const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const packagedDataFolderName = 'ImpossibluEditor'
const iconPath = path.join(__dirname, 'src', 'assets', 'icon.png')

function getDataDirectory() {
    if (app.isPackaged) {
        return path.join(app.getPath('appData'), packagedDataFolderName, 'local-data')
    }

    return path.join(__dirname, 'local-data')
}

function hasDataDirectory() {
    const dataDirectory = getDataDirectory()
    return fs.existsSync(dataDirectory) && fs.statSync(dataDirectory).isDirectory()
}

function formatCommitTimestamp(date) {
    const pad = (value) => String(value).padStart(2, '0')

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('-') +
        ' ' +
        [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(':')
}

function commitAllChanges(action, fileName) {
    const dataDirectory = getDataDirectory()
    const gitOptions = { cwd: dataDirectory, encoding: 'utf8' }

    execFileSync('git', ['add', '-A'], gitOptions)

    const status = execFileSync('git', ['status', '--short'], gitOptions).trim()

    if (!status) {
        return
    }

    const commitMessage = `${action} ${fileName} ${formatCommitTimestamp(new Date())}`
    execFileSync('git', ['commit', '-m', commitMessage], gitOptions)
}

function commitWithMessage(message) {
    const dataDirectory = getDataDirectory()
    const gitOptions = { cwd: dataDirectory, encoding: 'utf8' }

    execFileSync('git', ['add', '-A'], gitOptions)

    const status = execFileSync('git', ['status', '--short'], gitOptions).trim()

    if (!status) {
        return
    }

    execFileSync('git', ['commit', '-m', message], gitOptions)
}

function setupDataDirectory() {
    const dataDirectory = getDataDirectory()
    fs.mkdirSync(dataDirectory, { recursive: true })
    fs.chmodSync(dataDirectory, 0o777)

    if (!fs.existsSync(path.join(dataDirectory, '.git'))) {
        execFileSync('git', ['init'], { cwd: dataDirectory, encoding: 'utf8' })
    }
}

function normalizeRelativeLocalPath(entryPath) {
    if (typeof entryPath !== 'string') {
        throw new Error('Invalid path')
    }

    const trimmedPath = entryPath.trim().replace(/\\/g, '/')

    if (trimmedPath === '') {
        throw new Error('Invalid path')
    }

    const normalizedPath = path.posix.normalize(trimmedPath)

    if (
        normalizedPath === '.' ||
        normalizedPath === '..' ||
        normalizedPath.startsWith('../') ||
        normalizedPath.includes('/../') ||
        path.posix.isAbsolute(normalizedPath)
    ) {
        throw new Error('Invalid path')
    }

    return normalizedPath
}

function resolveLocalFilePath(fileName) {
    const dataDirectory = getDataDirectory()
    const normalizedPath = normalizeRelativeLocalPath(fileName)
    const filePath = path.join(dataDirectory, normalizedPath)
    const relativePath = path.relative(dataDirectory, filePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Invalid file path')
    }

    return filePath
}

function listLocalEntries() {
    const dataDirectory = getDataDirectory()
    const entries = []

    if (!fs.existsSync(dataDirectory)) {
        return entries
    }

    function visitDirectory(currentDirectory, parentPath = '') {
        const childEntries = fs
            .readdirSync(currentDirectory, { withFileTypes: true })
            .filter((entry) => entry.name !== '.git')
            .sort((leftEntry, rightEntry) => {
                if (leftEntry.isDirectory() && !rightEntry.isDirectory()) {
                    return -1
                }

                if (!leftEntry.isDirectory() && rightEntry.isDirectory()) {
                    return 1
                }

                return leftEntry.name.localeCompare(rightEntry.name)
            })

        childEntries.forEach((entry) => {
            const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

            if (entry.isDirectory()) {
                entries.push({
                    path: entryPath,
                    type: 'directory',
                })
                visitDirectory(path.join(currentDirectory, entry.name), entryPath)
                return
            }

            if (entry.isFile()) {
                entries.push({
                    path: entryPath,
                    type: 'file',
                })
            }
        })
    }

    visitDirectory(dataDirectory)

    return entries
}

function listLocalFiles() {
    return listLocalEntries()
        .filter((entry) => entry.type === 'file')
        .map((entry) => entry.path)
}

function readLocalFile(fileName) {
    const filePath = resolveLocalFilePath(fileName)

    if (!fs.existsSync(filePath)) {
        throw new Error('File not found')
    }

    return fs.readFileSync(filePath, 'utf8')
}

function searchLocalFiles(query) {
    if (typeof query !== 'string' || query.trim() === '') {
        return []
    }

    const normalizedQuery = query.toLowerCase()

    return listLocalFiles().flatMap((fileName) => {
        const content = readLocalFile(fileName)
        const lines = content.split(/\r?\n/)
        let fileOffset = 0

        return lines.flatMap((lineText, index) => {
            const lineMatches = []
            const normalizedLine = lineText.toLowerCase()
            let searchStart = 0

            while (searchStart < normalizedLine.length) {
                const matchIndex = normalizedLine.indexOf(normalizedQuery, searchStart)

                if (matchIndex === -1) {
                    break
                }

                lineMatches.push({
                    fileName,
                    lineNumber: index + 1,
                    lineText,
                    matchStart: fileOffset + matchIndex,
                    matchEnd: fileOffset + matchIndex + query.length,
                })
                searchStart = matchIndex + normalizedQuery.length
            }

            fileOffset += lineText.length + 1

            return lineMatches
        })
    })
}

function getRecentCommitMessages(page = 1, limit = 30) {
    const dataDirectory = getDataDirectory()
    if (!fs.existsSync(path.join(dataDirectory, '.git'))) {
        return {
            messages: [],
            total: 0,
        }
    }

    const totalOutput = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
        cwd: dataDirectory,
        encoding: 'utf8',
    }).trim()
    const total = Number.parseInt(totalOutput, 10) || 0

    if (total === 0) {
        return {
            messages: [],
            total: 0,
        }
    }

    const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
    const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 30)
    const skip = (safePage - 1) * safeLimit

    const output = execFileSync(
        'git',
        ['log', `-${safeLimit}`, `--skip=${skip}`, '--pretty=format:%s'],
        { cwd: dataDirectory, encoding: 'utf8' }
    ).trim()

    return {
        messages: output ? output.split('\n') : [],
        total,
    }
}

function writeLocalFile(fileName, content) {
    const filePath = resolveLocalFilePath(fileName)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
}

function createLocalFile(fileName) {
    const dataDirectory = getDataDirectory()
    const filePath = resolveLocalFilePath(fileName)

    fs.mkdirSync(dataDirectory, { recursive: true })

    if (fs.existsSync(filePath)) {
        throw new Error('File already exists')
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '', 'utf8')
}

function createLocalFolder(folderPath) {
    const targetFolderPath = resolveLocalFilePath(folderPath)

    if (fs.existsSync(targetFolderPath)) {
        throw new Error('Folder already exists')
    }

    fs.mkdirSync(targetFolderPath, { recursive: true })
}

function deleteLocalEntry(entryPath) {
    const targetPath = resolveLocalFilePath(entryPath)

    if (!fs.existsSync(targetPath)) {
        throw new Error('File not found')
    }

    fs.rmSync(targetPath, { force: true, recursive: true })
}

function cleanupEmptyDirectories(startDirectory) {
    const dataDirectory = getDataDirectory()
    let currentDirectory = startDirectory

    while (currentDirectory.startsWith(dataDirectory) && currentDirectory !== dataDirectory) {
        if (!fs.existsSync(currentDirectory)) {
            currentDirectory = path.dirname(currentDirectory)
            continue
        }

        const remainingEntries = fs
            .readdirSync(currentDirectory)
            .filter((entryName) => entryName !== '.git')

        if (remainingEntries.length > 0) {
            break
        }

        fs.rmdirSync(currentDirectory)
        currentDirectory = path.dirname(currentDirectory)
    }
}

function renameLocalFile(oldFileName, newFileName) {
    const oldFilePath = resolveLocalFilePath(oldFileName)
    const newFilePath = resolveLocalFilePath(newFileName)

    if (!fs.existsSync(oldFilePath)) {
        throw new Error('File not found')
    }

    if (fs.existsSync(newFilePath)) {
        throw new Error('File already exists')
    }

    fs.mkdirSync(path.dirname(newFilePath), { recursive: true })
    fs.renameSync(oldFilePath, newFilePath)
    cleanupEmptyDirectories(path.dirname(oldFilePath))
}

function openLocalDataTerminal() {
    const dataDirectory = getDataDirectory()
    if (process.platform === 'darwin') {
        const escapedPath = dataDirectory.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

        execFile('osascript', [
            '-e',
            'tell application "Terminal"',
            '-e',
            'activate',
            '-e',
            `do script "cd \\"${escapedPath}\\""`,
            '-e',
            'end tell',
        ])
        return true
    }

    throw new Error('Opening terminal is only supported on macOS right now')
}

function normalizeExternalLink(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('Invalid link')
    }

    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
        return value
    }

    return `https://${value}`
}

function openLinkInChrome(value) {
    const normalizedLink = normalizeExternalLink(value)

    if (process.platform === 'darwin') {
        execFile('open', ['-a', 'Google Chrome', normalizedLink])
        return true
    }

    throw new Error('Opening links in Chrome is only supported on macOS right now')
}

function createWindow() {
    const { workAreaSize } = screen.getPrimaryDisplay()
    const width = 1500
    const height = Math.round(workAreaSize.height * 0.9)

    const win = new BrowserWindow({
        width,
        height,
        resizable: false,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    const devServerUrl = process.env.ELECTRON_RENDERER_URL
    const reactBuildPath = path.join(__dirname, 'react-dist', 'react.html')
    const fallbackPath = path.join(__dirname, 'index.html')

    if (devServerUrl) {
        win.loadURL(devServerUrl)
        return
    }

    win.loadFile(fs.existsSync(reactBuildPath) ? reactBuildPath : fallbackPath)
}

ipcMain.handle('local-files:list', () => {
    return listLocalEntries()
})

ipcMain.handle('local-files:exists', () => {
    return hasDataDirectory()
})

ipcMain.handle('local-files:setup', () => {
    setupDataDirectory()
    return true
})

ipcMain.handle('local-files:read', (_event, fileName) => {
    return readLocalFile(fileName)
})

ipcMain.handle('local-files:search', (_event, query) => {
    return searchLocalFiles(query)
})

ipcMain.handle('local-files:history', (_event, page = 1, limit = 30) => {
    return getRecentCommitMessages(page, limit)
})

ipcMain.handle('local-files:open-terminal', () => {
    return openLocalDataTerminal()
})

ipcMain.handle('local-files:open-link', (_event, value) => {
    return openLinkInChrome(value)
})

ipcMain.handle('local-files:write', (_event, fileName, content) => {
    writeLocalFile(fileName, content)
    commitAllChanges('save', fileName)
    return true
})

ipcMain.handle('local-files:create', (_event, fileName) => {
    createLocalFile(fileName)
    commitAllChanges('create', fileName)
    return true
})

ipcMain.handle('local-files:create-folder', (_event, folderPath) => {
    createLocalFolder(folderPath)
    commitAllChanges('create-folder', folderPath)
    return true
})

ipcMain.handle('local-files:delete', (_event, fileName) => {
    deleteLocalEntry(fileName)
    cleanupEmptyDirectories(path.dirname(resolveLocalFilePath(fileName)))
    commitAllChanges('remove', fileName)
    return true
})

ipcMain.handle('local-files:rename', (_event, oldFileName, newFileName) => {
    renameLocalFile(oldFileName, newFileName)
    commitWithMessage(
        `rename ${oldFileName} to ${newFileName} ${formatCommitTimestamp(new Date())}`
    )
    return true
})

app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath)
    }

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const dataDirectory = path.join(__dirname, 'local-data')
const iconPath = path.join(__dirname, 'src', 'assets', 'icon.png')

function hasDataDirectory() {
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
    const gitOptions = { cwd: dataDirectory, encoding: 'utf8' }

    execFileSync('git', ['add', '-A'], gitOptions)

    const status = execFileSync('git', ['status', '--short'], gitOptions).trim()

    if (!status) {
        return
    }

    execFileSync('git', ['commit', '-m', message], gitOptions)
}

function setupDataDirectory() {
    fs.mkdirSync(dataDirectory, { recursive: true })
    fs.chmodSync(dataDirectory, 0o777)

    if (!fs.existsSync(path.join(dataDirectory, '.git'))) {
        execFileSync('git', ['init'], { cwd: dataDirectory, encoding: 'utf8' })
    }
}

function resolveLocalFilePath(fileName) {
    if (
        typeof fileName !== 'string' ||
        fileName.trim() === '' ||
        fileName !== path.basename(fileName)
    ) {
        throw new Error('Invalid file name')
    }

    const filePath = path.join(dataDirectory, fileName)
    const relativePath = path.relative(dataDirectory, filePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Invalid file path')
    }

    return filePath
}

function listLocalFiles() {
    if (!fs.existsSync(dataDirectory)) {
        return []
    }

    return fs
        .readdirSync(dataDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
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
    fs.writeFileSync(filePath, content, 'utf8')
}

function createLocalFile(fileName) {
    const filePath = resolveLocalFilePath(fileName)

    fs.mkdirSync(dataDirectory, { recursive: true })

    if (fs.existsSync(filePath)) {
        throw new Error('File already exists')
    }

    fs.writeFileSync(filePath, '', 'utf8')
}

function deleteLocalFile(fileName) {
    const filePath = resolveLocalFilePath(fileName)

    if (!fs.existsSync(filePath)) {
        throw new Error('File not found')
    }

    fs.unlinkSync(filePath)
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

    fs.renameSync(oldFilePath, newFilePath)
}

function openLocalDataTerminal() {
    if (process.platform === 'darwin') {
        execFile('osascript', [
            '-e',
            'tell application "Terminal"',
            '-e',
            'activate',
            '-e',
            `do script "cd ${dataDirectory.replace(/"/g, '\\"')}"`,
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
    return listLocalFiles()
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

ipcMain.handle('local-files:delete', (_event, fileName) => {
    deleteLocalFile(fileName)
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

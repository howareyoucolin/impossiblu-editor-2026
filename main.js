const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const dataDirectory = path.join(__dirname, 'local-data')

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
    const filePath = path.join(dataDirectory, fileName)
    const relativePath = path.relative(dataDirectory, filePath)

    if (
        relativePath.startsWith('..') ||
        path.isAbsolute(relativePath) ||
        !fs.existsSync(filePath)
    ) {
        throw new Error('File not found')
    }

    return fs.readFileSync(filePath, 'utf8')
}

function writeLocalFile(fileName, content) {
    const filePath = path.join(dataDirectory, fileName)
    const relativePath = path.relative(dataDirectory, filePath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Invalid file path')
    }

    fs.writeFileSync(filePath, content, 'utf8')
}

function createWindow() {
    const { workAreaSize } = screen.getPrimaryDisplay()
    const width = Math.round(workAreaSize.width * 0.9)
    const height = Math.round(workAreaSize.height * 0.9)

    const win = new BrowserWindow({
        width,
        height,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    const devServerUrl = process.env.ELECTRON_RENDERER_URL
    const reactBuildPath = path.join(__dirname, 'react-dist', 'index.html')
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

ipcMain.handle('local-files:read', (_event, fileName) => {
    return readLocalFile(fileName)
})

ipcMain.handle('local-files:write', (_event, fileName, content) => {
    writeLocalFile(fileName, content)
    return true
})

app.whenReady().then(() => {
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

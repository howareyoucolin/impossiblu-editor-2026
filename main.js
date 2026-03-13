const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
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

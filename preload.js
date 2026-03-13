const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFiles', {
    list: () => ipcRenderer.invoke('local-files:list'),
    read: (fileName) => ipcRenderer.invoke('local-files:read', fileName),
    write: (fileName, content) =>
        ipcRenderer.invoke('local-files:write', fileName, content),
})

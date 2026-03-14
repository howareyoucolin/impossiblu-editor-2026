const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFiles', {
    list: () => ipcRenderer.invoke('local-files:list'),
    read: (fileName) => ipcRenderer.invoke('local-files:read', fileName),
    write: (fileName, content) =>
        ipcRenderer.invoke('local-files:write', fileName, content),
    create: (fileName) => ipcRenderer.invoke('local-files:create', fileName),
    delete: (fileName) => ipcRenderer.invoke('local-files:delete', fileName),
})

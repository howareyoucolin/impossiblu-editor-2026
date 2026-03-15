const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFiles', {
    exists: () => ipcRenderer.invoke('local-files:exists'),
    list: () => ipcRenderer.invoke('local-files:list'),
    read: (fileName) => ipcRenderer.invoke('local-files:read', fileName),
    search: (query) => ipcRenderer.invoke('local-files:search', query),
    setup: () => ipcRenderer.invoke('local-files:setup'),
    write: (fileName, content) =>
        ipcRenderer.invoke('local-files:write', fileName, content),
    create: (fileName) => ipcRenderer.invoke('local-files:create', fileName),
    delete: (fileName) => ipcRenderer.invoke('local-files:delete', fileName),
    rename: (oldFileName, newFileName) =>
        ipcRenderer.invoke('local-files:rename', oldFileName, newFileName),
})

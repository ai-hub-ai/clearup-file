const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const { pipeline } = require('stream/promises')

let win
let currentScan = null

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  const devUrl = process.env.ELECTRON_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, 'app', 'dist', 'index.html'))
  }
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    dialog.showErrorBox('页面加载失败', `${code}: ${desc}\n${url || ''}`)
  })
}

function bytesThreshold(v) {
  if (typeof v === 'number' && v > 0) return v
  return 1024 * 1024 * 1024
}

function isRootPath(p) {
  const parsed = path.parse(p)
  return parsed.root === p
}

async function isFile(p) {
  try {
    const s = await fsp.lstat(p)
    return s.isFile()
  } catch {
    return false
  }
}

async function safeRename(src, dest) {
  try {
    await fsp.rename(src, dest)
  } catch (e) {
    if (e.code === 'EXDEV') {
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      const rs = fs.createReadStream(src)
      const ws = fs.createWriteStream(dest)
      await pipeline(rs, ws)
      await fsp.unlink(src)
    } else {
      throw e
    }
  }
}

async function startScan(rootDir, threshold) {
  if (currentScan && currentScan.running) {
    currentScan.running = false
  }
  const allowedPaths = new Set()
  const scanId = Date.now().toString()
  const dirQueue = []
  let running = 0
  const MAX = 8
  let pendingFiles = 0
  let processedFiles = 0
  let matches = 0
  let cancelled = false

  currentScan = { id: scanId, allowedPaths, running: true, paused: false }
  const matchBuffer = []
  let lastEmit = 0
  function emitBuffer(force) {
    if (matchBuffer.length === 0) return
    const now = Date.now()
    if (force || now - lastEmit >= 100) {
      const batch = matchBuffer.splice(0, matchBuffer.length)
      win.webContents.send('scan:matchBatch', batch)
      lastEmit = now
    }
  }

  function shouldIgnoreDir(p) {
    const segs = p.split(path.sep).filter(Boolean)
    const names = new Set(segs)
    if (names.has('node_modules') || names.has('.git')) return true
    if (process.platform === 'darwin') {
      const macRoots = ['/System', '/Library', '/Applications']
      if (macRoots.some(r => p.startsWith(r))) return true
    }
    if (process.platform === 'win32') {
      const winRoots = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)']
      if (winRoots.some(r => p.startsWith(r))) return true
    }
    return false
  }

  async function processDir(dirPath) {
    let d
    try {
      d = await fsp.opendir(dirPath)
    } catch {
      return
    }
    for await (const entry of d) {
      if (!currentScan.running) {
        cancelled = true
        break
      }
      if (currentScan.paused) {
        break
      }
      const full = path.join(dirPath, entry.name)
      if (entry.isSymbolicLink && entry.isSymbolicLink()) {
        continue
      }
      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(full)) enqueue(full)
      } else if (entry.isFile()) {
        pendingFiles++
        let s
        try {
          s = await fsp.stat(full)
        } catch {
          processedFiles++
          pendingFiles--
          continue
        }
        if (s.size >= threshold) {
          allowedPaths.add(full)
          matches++
          matchBuffer.push({
            name: entry.name,
            size: s.size,
            path: full,
            mtimeMs: s.mtimeMs
          })
          emitBuffer(false)
        }
        processedFiles++
        pendingFiles--
        const total = processedFiles + pendingFiles
        const percent = total === 0 ? 0 : processedFiles / total
        win.webContents.send('scan:progress', {
          processed: processedFiles,
          pending: pendingFiles,
          percent
        })
      }
    }
  }

  function enqueue(dirPath) {
    dirQueue.push(dirPath)
    pump()
  }

  function pump() {
    while (running < MAX && dirQueue.length > 0 && currentScan.running && !currentScan.paused) {
      const dir = dirQueue.shift()
      running++
      processDir(dir).finally(() => {
        running--
        pump()
      })
    }
    if (running === 0 && dirQueue.length === 0) {
      currentScan.running = false
      emitBuffer(true)
      win.webContents.send('scan:done', {
        processed: processedFiles,
        matches,
        cancelled
      })
    }
  }

  currentScan.pump = pump
  enqueue(rootDir)
  return scanId
}

ipcMain.handle('scan:start', async (_e, payload) => {
  const rootDir = payload && payload.rootDir
  const thr = bytesThreshold(payload && payload.thresholdBytes)
  if (!rootDir || typeof rootDir !== 'string') {
    throw new Error('Invalid rootDir')
  }
  let s
  try {
    s = await fsp.stat(rootDir)
  } catch {
    throw new Error('Directory not found')
  }
  if (!s.isDirectory()) {
    throw new Error('Not a directory')
  }
  return startScan(rootDir, thr)
})

ipcMain.handle('scan:stop', async () => {
  if (currentScan) currentScan.running = false
  return true
})

ipcMain.handle('scan:pause', async () => {
  if (currentScan) currentScan.paused = true
  return true
})

ipcMain.handle('scan:resume', async () => {
  if (currentScan) {
    currentScan.paused = false
    setImmediate(() => {
      if (currentScan && currentScan.running && typeof currentScan.pump === 'function') {
        currentScan.pump()
      }
    })
  }
  return true
})

ipcMain.handle('file:delete', async (_e, payload) => {
  const paths = payload && payload.paths
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('No paths')
  }
  const res = []
  for (const p of paths) {
    if (!currentScan || !currentScan.allowedPaths.has(p)) {
      res.push({ path: p, ok: false, error: 'Not allowed' })
      continue
    }
    if (isRootPath(p)) {
      res.push({ path: p, ok: false, error: 'Forbidden path' })
      continue
    }
    const ok = await isFile(p)
    if (!ok) {
      res.push({ path: p, ok: false, error: 'Not a file' })
      continue
    }
    try {
      await fsp.unlink(p)
      res.push({ path: p, ok: true })
    } catch (e) {
      res.push({ path: p, ok: false, error: e.message })
    }
  }
  return res
})

ipcMain.handle('file:trash', async (_e, payload) => {
  const paths = payload && payload.paths
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('No paths')
  }
  const res = []
  for (const p of paths) {
    if (!currentScan || !currentScan.allowedPaths.has(p)) {
      res.push({ path: p, ok: false, error: 'Not allowed' })
      continue
    }
    const ok = await isFile(p)
    if (!ok) {
      res.push({ path: p, ok: false, error: 'Not a file' })
      continue
    }
    try {
      await shell.trashItem(p)
      res.push({ path: p, ok: true })
    } catch (e) {
      res.push({ path: p, ok: false, error: e.message })
    }
  }
  return res
})

ipcMain.handle('file:reveal', async (_e, payload) => {
  const p = payload && payload.path
  if (!p || typeof p !== 'string') throw new Error('No path')
  try {
    shell.showItemInFolder(p)
    return true
  } catch (e) {
    throw new Error(e.message)
  }
})

ipcMain.handle('file:open', async (_e, payload) => {
  const p = payload && payload.path
  if (!p || typeof p !== 'string') throw new Error('No path')
  try {
    await shell.openPath(p)
    return true
  } catch (e) {
    throw new Error(e.message)
  }
})

ipcMain.handle('file:move', async (_e, payload) => {
  const paths = payload && payload.paths
  const destination = payload && payload.destination
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('No paths')
  }
  if (!destination || typeof destination !== 'string') {
    throw new Error('Invalid destination')
  }
  let dstat
  try {
    dstat = await fsp.stat(destination)
  } catch {
    throw new Error('Destination not found')
  }
  if (!dstat.isDirectory()) {
    throw new Error('Destination not directory')
  }
  const res = []
  for (const p of paths) {
    if (!currentScan || !currentScan.allowedPaths.has(p)) {
      res.push({ path: p, ok: false, error: 'Not allowed' })
      continue
    }
    const ok = await isFile(p)
    if (!ok) {
      res.push({ path: p, ok: false, error: 'Not a file' })
      continue
    }
    const base = path.basename(p)
    const dest = path.join(destination, base)
    try {
      await safeRename(p, dest)
      res.push({ path: p, ok: true, to: dest })
    } catch (e) {
      res.push({ path: p, ok: false, error: e.message })
    }
  }
  return res
})

ipcMain.handle('dialog:openDir', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (r.canceled || !r.filePaths || r.filePaths.length === 0) return null
  return r.filePaths[0]
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

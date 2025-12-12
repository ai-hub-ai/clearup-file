export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

export function formatDate(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

export const FILE_TYPES = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'heic'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'pages', 'numbers', 'key'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'dmg', 'pkg'],
  executable: ['exe', 'app', 'msi', 'bat', 'sh', 'apk']
}

export function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  for (const [type, exts] of Object.entries(FILE_TYPES)) {
    if (exts.includes(ext)) return type
  }
  return 'other'
}

export function getFileTypeLabel(type) {
  const map = {
    video: '视频',
    audio: '音频',
    image: '图片',
    document: '文档',
    archive: '压缩包/镜像',
    executable: '可执行文件',
    other: '其他'
  }
  return map[type] || type
}

export function getFileTypeColor(type) {
  const map = {
    video: '#3b82f6', // blue
    audio: '#8b5cf6', // purple
    image: '#ec4899', // pink
    document: '#10b981', // green
    archive: '#f59e0b', // amber
    executable: '#ef4444', // red
    other: '#64748b' // slate
  }
  return map[type] || '#64748b'
}

export const CLEANING_LEVELS = {
  SAFE: { id: 'safe', label: '建议清理', color: '#10b981', priority: 1 },
  CAUTION: { id: 'caution', label: '谨慎清理', color: '#f59e0b', priority: 2 },
  DANGER: { id: 'danger', label: '系统文件', color: '#ef4444', priority: 3 },
  UNKNOWN: { id: 'unknown', label: '其他文件', color: '#94a3b8', priority: 4 }
}

export function analyzeFileCategory(filePath) {
  if (!filePath) return CLEANING_LEVELS.UNKNOWN
  const p = filePath.toLowerCase()
  
  // System Critical
  // macOS System Integrity Protection usually protects these, but good to label
  if (p.startsWith('/system') || p.startsWith('/bin') || p.startsWith('/sbin') || p.startsWith('/usr') || p.startsWith('/var') || p.startsWith('/private')) {
    return CLEANING_LEVELS.DANGER
  }
  
  // System Library (Global)
  if (p === '/library' || p.startsWith('/library/')) {
    // Global Caches/Logs might be safe, but generally system level is dangerous/caution
    if (p.includes('/caches/') || p.includes('/logs/')) return CLEANING_LEVELS.CAUTION
    return CLEANING_LEVELS.DANGER
  }

  // Developer Junk (High confidence safe)
  if (p.includes('/node_modules/') || p.includes('/target/debug/') || p.includes('/build/outputs/') || p.includes('/deriveddata/')) {
    return CLEANING_LEVELS.SAFE
  }

  // User Caches & Logs
  if (p.includes('/library/caches/') || p.includes('/library/logs/') || p.includes('/library/saved application state/')) {
    return CLEANING_LEVELS.SAFE
  }
  
  // Trash
  if (p.includes('/.trash/')) return CLEANING_LEVELS.SAFE

  // Downloads - Mix of safe and caution
  if (p.includes('/downloads/')) {
    // Installers/Archives in downloads are usually safe to delete
    if (p.endsWith('.dmg') || p.endsWith('.pkg') || p.endsWith('.iso') || p.endsWith('.zip') || p.endsWith('.rar') || p.endsWith('.7z')) {
      return CLEANING_LEVELS.SAFE
    }
    // Other files in downloads might be important
    return CLEANING_LEVELS.CAUTION
  }

  // Applications
  if (p.startsWith('/applications') || p.includes('/applications/')) {
    return CLEANING_LEVELS.CAUTION
  }

  // User Data - Caution
  if (p.includes('/documents/') || p.includes('/desktop/') || p.includes('/pictures/') || p.includes('/music/') || p.includes('/movies/')) {
    return CLEANING_LEVELS.CAUTION
  }
  
  // App Data (Library/Application Support) - Caution
  if (p.includes('/library/application support/')) {
    return CLEANING_LEVELS.CAUTION
  }

  return CLEANING_LEVELS.UNKNOWN
}

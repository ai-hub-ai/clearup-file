import React, { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes, formatDate, getFileType, getFileTypeLabel, getFileTypeColor, FILE_TYPES, analyzeFileCategory, CLEANING_LEVELS } from './utils.js'

const api = typeof window !== 'undefined' ? window.api : null

export default function App() {
  const [rootDir, setRootDir] = useState('')
  const [thresholdValue, setThresholdValue] = useState(1)
  const [thresholdUnit, setThresholdUnit] = useState('GB')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ percent: 0, processed: 0, pending: 0 })
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('size')
  const [sortDir, setSortDir] = useState('desc')
  const [timeRange, setTimeRange] = useState('all')
  const [extFilter, setExtFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [adviceFilter, setAdviceFilter] = useState('all')
  const [theme, setTheme] = useState('dark')
  const [status, setStatus] = useState('')
  const lastScanId = useRef(null)
  const scanStartAt = useRef(0)
  const gridRef = useRef(null)
  const [view, setView] = useState({ start: 0, end: 50 })
  const ROW_HEIGHT = 40
  const [gridHeight, setGridHeight] = useState(520)
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    if (!api) return
    const onMatch = data => {
      data.advice = analyzeFileCategory(data.path)
      setItems(prev => [...prev, data])
    }
    const onMatchBatch = batch => {
      batch.forEach(i => i.advice = analyzeFileCategory(i.path))
      setItems(prev => {
        const seen = new Set(prev.map(i => i.path))
        const add = batch.filter(i => !seen.has(i.path))
        return [...prev, ...add]
      })
    }
    const onProgress = data => {
      setProgress(data)
    }
    const onDone = data => {
      setScanning(false)
      setStatus(`完成，匹配 ${data.matches} 项`)
    }
    api.onScanMatch(onMatch)
    api.onScanMatchBatch(onMatchBatch)
    api.onScanProgress(onProgress)
    api.onScanDone(onDone)
  }, [api])

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('prefs') || '{}')
      if (p.rootDir) setRootDir(p.rootDir)
      if (p.thresholdValue) setThresholdValue(p.thresholdValue)
      if (p.thresholdUnit) setThresholdUnit(p.thresholdUnit)
      if (p.timeRange) setTimeRange(p.timeRange)
      if (p.extFilter) setExtFilter(p.extFilter)
      if (p.theme) setTheme(p.theme)
    } catch {}
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const prefs = {
      rootDir,
      thresholdValue,
      thresholdUnit,
      timeRange,
      extFilter,
      theme
    }
    try {
      localStorage.setItem('prefs', JSON.stringify(prefs))
    } catch {}
  }, [rootDir, thresholdValue, thresholdUnit, timeRange, extFilter, theme])

  const filtered = useMemo(() => {
    const minBytes = (thresholdUnit === 'GB' ? thresholdValue * 1024 * 1024 * 1024 : thresholdValue * 1024 * 1024)
    const now = Date.now()
    let minTime = 0
    if (timeRange === '7d') minTime = now - 7 * 24 * 60 * 60 * 1000
    else if (timeRange === '30d') minTime = now - 30 * 24 * 60 * 60 * 1000
    else if (timeRange === '180d') minTime = now - 180 * 24 * 60 * 60 * 1000
    const exts = extFilter.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    let arr = items.filter(i => i.size >= minBytes)
    if (minTime > 0) {
      arr = arr.filter(i => i.mtimeMs >= minTime)
    }
    if (typeFilter !== 'all') {
      arr = arr.filter(i => getFileType(i.name) === typeFilter)
    }
    if (adviceFilter !== 'all') {
      arr = arr.filter(i => i.advice?.id === adviceFilter)
    }
    if (exts.length > 0) {
      const lower = arr.map(a => a)
      arr = lower.filter(i => {
        const p = i.path.toLowerCase()
        return exts.some(ext => ext.startsWith('.') ? p.endsWith(ext) : p.endsWith('.' + ext))
      })
    }
    if (filterText.trim()) {
      const t = filterText.trim().toLowerCase()
      arr = arr.filter(i => i.path.toLowerCase().includes(t))
    }
    arr.sort((a, b) => {
      let r = 0
      if (sortKey === 'size') r = a.size - b.size
      else if (sortKey === 'path') r = a.path.localeCompare(b.path)
      else if (sortKey === 'mtime') r = a.mtimeMs - b.mtimeMs
      return sortDir === 'asc' ? r : -r
    })
    return arr
  }, [items, filterText, sortKey, sortDir, thresholdValue, thresholdUnit, timeRange, extFilter, typeFilter, adviceFilter])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    function update() {
      const h = el.clientHeight || 400
      const st = el.scrollTop || 0
      const total = filtered.length
      const visible = Math.max(1, Math.ceil(h / ROW_HEIGHT) + 6)
      const start = Math.max(0, Math.floor(st / ROW_HEIGHT))
      const end = Math.min(total, start + visible)
      setView({ start, end })
    }
    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [filtered.length])

  useEffect(() => {
    function computeHeight() {
      const el = gridRef.current
      if (!el) return
      setGridHeight(el.clientHeight)
    }
    computeHeight()
    window.addEventListener('resize', computeHeight)
    return () => window.removeEventListener('resize', computeHeight)
  }, [])

  useEffect(() => {
    function onKey(e) {
      const mac = navigator.platform.toLowerCase().includes('mac')
      const isAccel = mac ? e.metaKey : e.ctrlKey
      if (e.key === 'Escape') {
        setMenu(null)
        setSelected(new Set())
      } else if (isAccel && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const s = new Set(selected)
        filtered.forEach(i => s.add(i.path))
        setSelected(s)
      } else if (e.key === 'Delete') {
        if (selected.size > 0) {
          e.preventDefault()
          const paths = Array.from(selected)
          ;(async () => {
            if (!api) return
            const res = await api.trashFiles(paths)
            const oks = res.filter(r => r.ok).map(r => r.path)
            if (oks.length > 0) {
              setItems(prev => prev.filter(i => !oks.includes(i.path)))
              const s = new Set(selected); oks.forEach(p => s.delete(p)); setSelected(s)
              setStatus('已移至回收站')
            }
          })()
        }
      } else if (isAccel && e.key.toLowerCase() === 'c') {
        if (selected.size === 1) {
          const p = Array.from(selected)[0]
          api && api.copyText(p)
          setStatus('已复制路径')
        }
      } else if (e.key === 'Enter') {
        if (selected.size === 1) {
          const p = Array.from(selected)[0]
          api && api.revealInFolder(p)
        }
      } else if (e.key.toLowerCase() === 'm') {
        if (selected.size > 0) {
          ;(async () => {
            const dest = await api.openDirectoryDialog()
            if (!dest) return
            if (!window.confirm(`确认将选中 ${selected.size} 个文件移动到:\n${dest}？`)) return
            const paths = Array.from(selected)
            setStatus('移动中')
            const res = await api.moveFiles(paths, dest)
            const oks = res.filter(r => r.ok).map(r => r.path)
            if (oks.length > 0) {
              setItems(prev => prev.filter(i => !oks.includes(i.path)))
              const s = new Set(selected); oks.forEach(p => s.delete(p)); setSelected(s)
            }
            const errs = res.filter(r => !r.ok)
            if (errs.length > 0) setStatus(`失败 ${errs.length}`); else setStatus('移动完成')
          })()
        }
      } else if (isAccel && e.key.toLowerCase() === 'i') {
        const s = new Set()
        filtered.forEach(i => {
          if (!selected.has(i.path)) s.add(i.path)
        })
        setSelected(s)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', () => setMenu(null))
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', () => setMenu(null))
    }
  }, [filtered, selected])

  const typeStats = useMemo(() => {
    const stats = {}
    items.forEach(i => {
      const t = getFileType(i.name)
      if (!stats[t]) stats[t] = { count: 0, size: 0 }
      stats[t].count++
      stats[t].size += i.size
    })
    const totalSize = Object.values(stats).reduce((acc, s) => acc + s.size, 0)
    return Object.entries(stats)
      .map(([type, s]) => ({ type, ...s, percent: totalSize > 0 ? s.size / totalSize : 0 }))
      .sort((a, b) => b.size - a.size)
  }, [items])

  const adviceStats = useMemo(() => {
    const stats = {}
    items.forEach(i => {
      const adv = i.advice || CLEANING_LEVELS.UNKNOWN
      const id = adv.id
      if (!stats[id]) stats[id] = { ...adv, count: 0, size: 0 }
      stats[id].count++
      stats[id].size += i.size
    })
    const totalSize = Object.values(stats).reduce((acc, s) => acc + s.size, 0)
    return Object.values(stats)
      .map(s => ({ ...s, percent: totalSize > 0 ? s.size / totalSize : 0 }))
      .sort((a, b) => a.priority - b.priority)
  }, [items])

  const selectedStats = useMemo(() => {
    let count = 0
    let size = 0
    const map = new Map(items.map(i => [i.path, i]))
    selected.forEach(p => {
      const it = map.get(p)
      if (it) {
        count++
        size += it.size
      }
    })
    return { count, size }
  }, [selected, items])

  function toggleSelect(p) {
    const s = new Set(selected)
    if (s.has(p)) s.delete(p)
    else s.add(p)
    setSelected(s)
  }

  const allChecked = filtered.length > 0 && filtered.every(i => selected.has(i.path))
  function toggleSelectAll() {
    const s = new Set(selected)
    if (allChecked) {
      filtered.forEach(i => s.delete(i.path))
    } else {
      filtered.forEach(i => s.add(i.path))
    }
    setSelected(s)
  }

  async function chooseRoot() {
    if (!api) return
    const dir = await api.openDirectoryDialog()
    if (dir) setRootDir(dir)
  }

  async function startScan() {
    if (!rootDir) {
      setStatus('请选择目录')
      return
    }
    const thrBytes = (thresholdUnit === 'GB' ? thresholdValue * 1024 * 1024 * 1024 : thresholdValue * 1024 * 1024)
    if (!thrBytes || thrBytes <= 0) {
      setStatus('最小文件大小需大于 0')
      return
    }
    setItems([])
    setSelected(new Set())
    setStatus('')
    setScanning(true)
    scanStartAt.current = Date.now()
    if (!api) {
      setStatus('API 未就绪')
      setScanning(false)
      return
    }
    const sid = await api.scanStart({
      rootDir,
      thresholdBytes: thrBytes
    })
    lastScanId.current = sid
  }

  async function stopScan() {
    if (!api) return
    await api.scanStop()
    setScanning(false)
    setStatus('已停止')
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(`确认删除选中 ${selected.size} 个文件？`)) return
    const paths = Array.from(selected)
    setStatus('删除中')
    if (!api) return
    const res = await api.deleteFiles(paths)
    const oks = res.filter(r => r.ok).map(r => r.path)
    if (oks.length > 0) {
      setItems(prev => prev.filter(i => !oks.includes(i.path)))
      const s = new Set(selected)
      oks.forEach(p => s.delete(p))
      setSelected(s)
    }
    const errs = res.filter(r => !r.ok)
    if (errs.length > 0) setStatus(`失败 ${errs.length}`)
    else setStatus('删除完成')
  }

  async function moveSelected() {
    if (selected.size === 0) return
    if (!api) return
    const dest = await api.openDirectoryDialog()
    if (!dest) return
    if (!window.confirm(`确认将选中 ${selected.size} 个文件移动到:\n${dest}？`)) return
    const paths = Array.from(selected)
    setStatus('移动中')
    const res = await api.moveFiles(paths, dest)
    const oks = res.filter(r => r.ok).map(r => r.path)
    if (oks.length > 0) {
      setItems(prev => prev.filter(i => !oks.includes(i.path)))
      const s = new Set(selected)
      oks.forEach(p => s.delete(p))
      setSelected(s)
    }
    const errs = res.filter(r => !r.ok)
    if (errs.length > 0) setStatus(`失败 ${errs.length}`)
    else setStatus('移动完成')
  }

  function renderRow(i) {
    const checked = selected.has(i.path)
    return (
      <tr key={i.path} className={checked ? 'selected' : ''} onDoubleClick={async () => { if (!api) return; await api.revealInFolder(i.path) }} onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path: i.path }) }}>
        <td className="col-check">
          <input type="checkbox" checked={checked} onChange={() => toggleSelect(i.path)} />
        </td>
        <td className="col-name" title={i.name}>{i.name}</td>
        <td style={{ width: 80, textAlign: 'center' }}>
           {i.advice && (
             <span className="badge-advice" style={{ background: i.advice.color }}>{i.advice.label}</span>
           )}
        </td>
        <td className="col-size">{formatBytes(i.size)}</td>
        <td className="col-path path" title={i.path}>{i.path}</td>
        <td className="col-date">{formatDate(i.mtimeMs)}</td>
      </tr>
    )
  }

  function headerCell(key, label, cls) {
    const active = sortKey === key
    const dir = active ? sortDir : 'desc'
    function toggle() {
      if (active) setSortDir(dir === 'asc' ? 'desc' : 'asc')
      else setSortKey(key)
    }
    return (
      <th className={`th-sort ${cls || ''}`} onClick={toggle}>
        {label} {active ? (dir === 'asc' ? '▲' : '▼') : ''}
      </th>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <div className="title">ClearUp File</div>
        <div className="badge">跨平台清理大文件</div>
        <div style={{ flex: 1 }} />
        <button className="btn-icon" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="切换主题">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      
      <div className="main-container">
        {/* Sidebar */}
        <div className="sidebar">
          {!api && (
            <div style={{ color: 'var(--danger)', fontSize: 12 }}>
              渲染进程未检测到 API
            </div>
          )}
          
          <div className="sidebar-group">
            <span className="section-title">扫描目录</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} value={rootDir} onChange={e => setRootDir(e.target.value)} placeholder="选择或输入路径" />
              <button className="btn-icon" onClick={chooseRoot} title="选择文件夹">📂</button>
            </div>
          </div>

          <div className="sidebar-group">
            <span className="section-title">最小文件大小</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="number" type="number" min="0.001" step="0.01" value={thresholdValue} onChange={e => { const v = Number(e.target.value); setThresholdValue(v) }} style={{ flex: 1 }} />
              <select className="select" value={thresholdUnit} onChange={e => { const u = e.target.value; setThresholdUnit(u) }} style={{ width: 60 }}>
                <option value="GB">GB</option>
                <option value="MB">MB</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="btn" style={{ flex: 1, fontSize: 12, padding: '4px' }} onClick={() => { setThresholdUnit('MB'); setThresholdValue(100) }}>100MB</button>
              <button className="btn" style={{ flex: 1, fontSize: 12, padding: '4px' }} onClick={() => { setThresholdUnit('MB'); setThresholdValue(500) }}>500MB</button>
              <button className="btn" style={{ flex: 1, fontSize: 12, padding: '4px' }} onClick={() => { setThresholdUnit('GB'); setThresholdValue(2) }}>2GB</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, margin: '8px 0' }}>
             {typeStats.length > 0 && (
               <div className="sidebar-group">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span className="section-title">文件分布</span>
                   {typeFilter !== 'all' && <button className="btn-icon" style={{fontSize: 10}} onClick={() => setTypeFilter('all')}>清除</button>}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {typeStats.map(s => (
                      <div 
                         key={s.type} 
                         onClick={() => setTypeFilter(typeFilter === s.type ? 'all' : s.type)}
                         className={`type-row ${typeFilter === s.type ? 'active' : ''}`}
                      >
                         <div className="type-header">
                           <span className="type-label">{getFileTypeLabel(s.type)}</span>
                           <span className="type-size">{formatBytes(s.size)}</span>
                         </div>
                         <div className="type-bar-bg">
                           <div className="type-bar-fill" style={{ width: `${s.percent * 100}%`, background: getFileTypeColor(s.type) }} />
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             )}

             {adviceStats.length > 0 && (
               <div className="sidebar-group">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span className="section-title">清理建议</span>
                   {adviceFilter !== 'all' && <button className="btn-icon" style={{fontSize: 10}} onClick={() => setAdviceFilter('all')}>清除</button>}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {adviceStats.map(s => (
                      <div 
                         key={s.id} 
                         onClick={() => setAdviceFilter(adviceFilter === s.id ? 'all' : s.id)}
                         className={`type-row ${adviceFilter === s.id ? 'active' : ''}`}
                      >
                         <div className="type-header">
                           <span className="type-label">{s.label}</span>
                           <span className="type-size">{formatBytes(s.size)}</span>
                         </div>
                         <div className="type-bar-bg">
                           <div className="type-bar-fill" style={{ width: `${s.percent * 100}%`, background: s.color }} />
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             )}
          </div>

          <div className="sidebar-group">
            <button className="btn btn-primary" onClick={startScan} disabled={scanning} style={{ height: 40, fontSize: 14 }}>
              {scanning ? '扫描中...' : '开始扫描'}
            </button>
            {scanning && <button className="btn btn-danger" onClick={stopScan}>停止扫描</button>}
          </div>
        </div>

        {/* Main Content */}
        <div className="content">
          {/* Top Toolbar: Filters & Actions */}
          <div className="toolbar">
             <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                <input className="input" style={{ width: 200 }} value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="🔍 搜索路径..." />
                <select className="select" value={timeRange} onChange={e => setTimeRange(e.target.value)}>
                  <option value="all">全部时间</option>
                  <option value="7d">最近7天</option>
                  <option value="30d">最近30天</option>
                  <option value="180d">最近半年</option>
                </select>
                <input className="input" style={{ width: 120 }} value={extFilter} onChange={e => setExtFilter(e.target.value)} placeholder="扩展名 (如 mp4)" />
             </div>
             <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => { setSelected(new Set()) }} disabled={selected.size === 0}>清空选择</button>
                <button className="btn btn-danger" onClick={deleteSelected} disabled={selected.size === 0}>删除</button>
                <button className="btn" onClick={async () => {
                  if (selected.size === 0 || !api) return
                  if (!window.confirm(`确认将 ${selected.size} 个文件移至回收站？`)) return
                  const paths = Array.from(selected)
                  setStatus('移至回收站中')
                  const res = await api.trashFiles(paths)
                  const oks = res.filter(r => r.ok).map(r => r.path)
                  if (oks.length > 0) {
                    setItems(prev => prev.filter(i => !oks.includes(i.path)))
                    const s = new Set(selected); oks.forEach(p => s.delete(p)); setSelected(s)
                  }
                  const errs = res.filter(r => !r.ok)
                  if (errs.length > 0) {
                    const err = errs[0]?.error || '未知错误'
                    setStatus(`失败 ${errs.length}：${err}`)
                  } else {
                    setStatus('已移至回收站')
                  }
                }} disabled={selected.size === 0}>回收站</button>
                <button className="btn" onClick={moveSelected} disabled={selected.size === 0}>移动</button>
                <button className="btn-icon" title="导出CSV" onClick={() => {
                  const rows = filtered.map(i => ({
                    name: i.name,
                    size: i.size,
                    path: i.path,
                    mtime: formatDate(i.mtimeMs)
                  }))
                  const header = ['name', 'size', 'path', 'mtime']
                  const escape = v => `"${String(v).replace(/"/g, '""')}"`
                  const csv = [header.join(','), ...rows.map(r => header.map(h => escape(r[h])).join(','))].join('\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'clearup-file.csv'
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}>⬇️</button>
             </div>
          </div>

          {/* Grid */}
          <div className="grid" ref={gridRef} style={{ height: '100%' }}>
            <table>
              <thead>
                <tr>
                  <th className="col-check">
                    <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
                  </th>
                  <th className="col-name">文件名</th>
                  <th style={{ width: 80, textAlign: 'center' }}>建议</th>
                  {headerCell('size', '大小', 'col-size')}
                  {headerCell('path', '路径', 'col-path')}
                  {headerCell('mtime', '修改时间', 'col-date')}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const total = filtered.length
                  const top = view.start * ROW_HEIGHT
                  const bottom = Math.max(total - view.end, 0) * ROW_HEIGHT
                  const cols = 6
                  const rows = filtered.slice(view.start, view.end)
                  return (
                    <>
                      <tr style={{ height: top }}>
                        <td colSpan={cols} />
                      </tr>
                      {rows.map(i => renderRow(i))}
                      <tr style={{ height: bottom }}>
                        <td colSpan={cols} />
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>
          </div>

          {/* Bottom Status Bar */}
          <div className="bottom-bar">
             <div style={{ display: 'flex', gap: 16 }}>
                <span>选中: {selectedStats.count} ({formatBytes(selectedStats.size)})</span>
                <span>显示: {filtered.length} ({formatBytes(filtered.reduce((s, i) => s + i.size, 0))})</span>
                <span>{status}</span>
             </div>
             {scanning && (
               <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                 <div className="progress" style={{ width: 100, height: 6, background: 'rgba(255,255,255,0.2)' }}>
                    <div className="progress-bar" style={{ width: `${Math.round(progress.percent * 100)}%`, background: 'white' }} />
                 </div>
                 <span>{Math.round(progress.percent * 100)}%</span>
               </div>
             )}
          </div>
        </div>
      </div>
      
      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }}>
          <div className="menu-item" onClick={async () => { if (!api) return; await api.revealInFolder(menu.path); setMenu(null) }}>显示所在文件夹</div>
          <div className="menu-item" onClick={async () => { if (!api) return; await api.openPath(menu.path); setMenu(null) }}>打开文件</div>
          <div className="menu-item" onClick={() => { if (!api) return; api.copyText(menu.path); setStatus('已复制路径'); setMenu(null) }}>复制路径</div>
          <div className="menu-item" onClick={async () => {
            if (!api) return
            const res = await api.trashFiles([menu.path])
            if (res[0]?.ok) {
               setItems(prev => prev.filter(i => i.path !== menu.path))
               setStatus('已移至回收站')
            } else {
               setStatus('移动失败')
            }
            setMenu(null)
          }}>移至回收站</div>
        </div>
      )}
    </div>
  )
}

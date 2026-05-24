import { createContext, useContext, useState, useCallback } from 'react'
import { mockClassify, mockSegment } from '../utils/mockInference'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [mode, setMode]                   = useState('single')
  const [results, setResults]             = useState(null)
  const [isProcessing, setIsProcessing]   = useState(false)
  const [masksLoading, setMasksLoading]   = useState(false)

  // Two-phase inference:
  //   Phase 1 — classification (fast). Sets results & clears isProcessing so
  //             Processing.jsx navigates to /results immediately.
  //   Phase 2 — segmentation (slow). Runs in the background after navigation,
  //             updates results.sliceResults + maskFound when done.
  const runInference = useCallback(async (files, inferMode) => {
    setIsProcessing(true)
    setMasksLoading(false)
    setResults(null)

    // ── Phase 1: classify ────────────────────────────────────────────────
    const t0 = performance.now()
    let classResult
    try {
      classResult = await _callClassify(files, inferMode)
      console.log('[AXIA] classify OK:', JSON.stringify(classResult))
    } catch (err) {
      console.error('[AXIA] classify FAILED — falling back to mock. Reason:', err)
      classResult = mockClassify(files)
    }
    const classificationMs = Math.round(performance.now() - t0)

    const needsSeg = classResult.type === 'hemorrhage' || classResult.type === 'ischemic'

    // Publish partial results — Processing.jsx will navigate to /results
    setResults({
      ...classResult,
      classificationMs,
      maskFound:    false,
      sliceResults: files.map(() => ({ maskFound: false, confidence: 0, maskImage: null })),
    })
    setIsProcessing(false)

    if (!needsSeg) return

    // ── Phase 2: segment ─────────────────────────────────────────────────
    setMasksLoading(true)
    const t1 = performance.now()
    try {
      const segResult = await _callSegment(files, classResult.type)
      const segmentationMs = Math.round(performance.now() - t1)
      console.log('[AXIA] segment OK:', JSON.stringify(segResult).slice(0, 300))
      setResults(prev => ({ ...prev, ...segResult, segmentationMs }))
    } catch (err) {
      console.error('[AXIA] segment FAILED — falling back to mock. Reason:', err)
      const segResult = mockSegment(files, classResult.type)
      setResults(prev => ({ ...prev, ...segResult, segmentationMs: 0 }))
    } finally {
      setMasksLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setUploadedFiles([])
    setResults(null)
    setMode('single')
    setMasksLoading(false)
  }, [])

  return (
    <AppContext.Provider value={{
      uploadedFiles, setUploadedFiles,
      mode, setMode,
      results,
      isProcessing,
      masksLoading,
      runInference,
      reset,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function _callClassify(files, mode) {
  const form = new FormData()
  files.forEach(f => form.append('files', f.file, f.name))
  form.append('mode', mode)
  const res = await fetch('/api/classify', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function _callSegment(files, type) {
  const form = new FormData()
  files.forEach(f => form.append('files', f.file, f.name))
  form.append('type', type)
  const res = await fetch('/api/segment', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

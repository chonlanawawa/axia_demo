import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Navbar from '../components/Navbar'
import { Upload as UploadIcon, X, ImageIcon } from 'lucide-react'

const ACCEPT = '.png,.jpg,.jpeg,.dcm,.dicom'

async function fetchDicomPreview(file) {
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/preview', { method: 'POST', body: form })
    if (res.ok) {
      const { image } = await res.json()
      return image   // data:image/png;base64,...
    }
  } catch (_) {}
  return null
}

function DropZone({ label, multiple, files, onFiles, onRemove }) {
  const inputRef = useRef(null)
  const [dragging, setDragging]   = useState(false)
  const [fetching, setFetching]   = useState(false)

  const addFiles = useCallback(async (incoming) => {
    const valid = Array.from(incoming).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase()
      return ['png', 'jpg', 'jpeg', 'dcm', 'dicom'].includes(ext)
    })
    if (!valid.length) return

    const hasDicom = valid.some(f => ['dcm','dicom'].includes(f.name.split('.').pop().toLowerCase()))
    if (hasDicom) setFetching(true)

    const withUrls = await Promise.all(valid.map(async f => {
      const ext = f.name.split('.').pop().toLowerCase()
      const isDicom = ['dcm', 'dicom'].includes(ext)
      const url = isDicom ? await fetchDicomPreview(f) : URL.createObjectURL(f)
      return { file: f, name: f.name, url, isDicom }
    }))

    setFetching(false)
    onFiles(multiple ? prev => [...prev, ...withUrls] : [withUrls[0]])
  }, [multiple, onFiles])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      {/* Drop area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          relative flex-1 min-h-[320px] rounded-2xl border-2 border-dashed cursor-pointer
          flex flex-col items-center justify-center gap-3 p-6 transition-all duration-200
          ${dragging
            ? 'border-axia-400 bg-axia-100/60 scale-[1.01]'
            : 'border-axia-300 bg-white/30 hover:bg-axia-50/50 hover:border-axia-400'
          }
        `}
      >
        {fetching
          ? <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-axia-200 border-t-axia-400 animate-spin" />
              <p className="text-axia-400 text-sm font-inter">Fetching DICOM preview…</p>
            </div>
          : <UploadIcon className="w-10 h-10 text-axia-300" strokeWidth={1.5} />
        }
        <p className="font-inter text-axia-500 text-center text-base font-medium leading-snug">
          {label}
        </p>
        <p className="text-axia-400 text-xs">(PNG, JPG, DICOM)</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-white/50 rounded-lg px-3 py-1.5 text-xs text-axia-600 font-inter"
            >
              {f.url
                ? <img src={f.url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                : <ImageIcon className="w-4 h-4 shrink-0 text-axia-400" />
              }
              <span className="truncate flex-1">{f.name}</span>
              {f.isDicom && (
                <span className="shrink-0 text-[10px] bg-axia-200 text-axia-600 rounded px-1">DCM</span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onRemove(i) }}
                className="shrink-0 text-axia-400 hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Upload() {
  const { setUploadedFiles, setMode, runInference } = useApp()
  const navigate = useNavigate()

  const [singleFiles, setSingleFiles] = useState([])
  const [multiFiles, setMultiFiles]   = useState([])

  const removeSingle = (i) => setSingleFiles(prev => prev.filter((_, idx) => idx !== i))
  const removeMulti  = (i) => setMultiFiles (prev => prev.filter((_, idx) => idx !== i))

  const canAnalyzeSingle = singleFiles.length > 0
  const canAnalyzeMulti  = multiFiles.length > 1

  const analyze = (files, mode) => {
    setUploadedFiles(files)
    setMode(mode)
    navigate('/processing')
    runInference(files, mode)   // don't await — Processing.jsx watches isProcessing
  }

  return (
    <div className="min-h-screen bg-axia-gradient flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8">
        <h2 className="font-inter text-axia-500 text-2xl font-medium tracking-wide">
          Select Analysis Mode
        </h2>

        <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 items-start">
          {/* Single Slice */}
          <div className="flex-1 flex flex-col gap-4">
            <DropZone
              label="Upload 1 Slice"
              multiple={false}
              files={singleFiles}
              onFiles={setSingleFiles}
              onRemove={removeSingle}
            />
            <button
              onClick={() => canAnalyzeSingle && analyze(singleFiles, 'single')}
              disabled={!canAnalyzeSingle}
              className={`
                w-full py-3 rounded-xl font-inter font-medium text-base transition-all duration-200
                ${canAnalyzeSingle
                  ? 'bg-axia-400 text-white hover:bg-axia-500 hover:scale-[1.01] shadow-md shadow-axia-300/30 active:scale-95'
                  : 'bg-axia-100 text-axia-300 cursor-not-allowed'
                }
              `}
            >
              Analyze Single Slice
            </button>
          </div>

          {/* Divider */}
          <div className="hidden md:flex flex-col items-center justify-center self-stretch">
            <div className="w-px flex-1 bg-axia-200" />
            <span className="my-3 text-axia-300 text-xs font-inter">or</span>
            <div className="w-px flex-1 bg-axia-200" />
          </div>

          {/* Multiple Slices */}
          <div className="flex-1 flex flex-col gap-4">
            <DropZone
              label={`Upload Slices (${multiFiles.length} loaded)`}
              multiple={true}
              files={multiFiles}
              onFiles={setMultiFiles}
              onRemove={removeMulti}
            />
            <button
              onClick={() => canAnalyzeMulti && analyze(multiFiles, 'multi')}
              disabled={!canAnalyzeMulti}
              className={`
                w-full py-3 rounded-xl font-inter font-medium text-base transition-all duration-200
                ${canAnalyzeMulti
                  ? 'bg-axia-400 text-white hover:bg-axia-500 hover:scale-[1.01] shadow-md shadow-axia-300/30 active:scale-95'
                  : 'bg-axia-100 text-axia-300 cursor-not-allowed'
                }
              `}
            >
              Analyze {multiFiles.length > 1 ? `${multiFiles.length} Slices` : 'Slices'} {!canAnalyzeMulti && multiFiles.length <= 1 ? '(need ≥ 2)' : ''}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

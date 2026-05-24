import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ImageIcon, X, Maximize2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Tooltip content per classification type
// ---------------------------------------------------------------------------
const MASK_INFO = {
  hemorrhage: {
    title: 'Hemorrhagic Lesion',
    headerCls: 'text-red-600',
    borderCls: 'border-red-200 bg-red-50',
    textCls: 'text-red-800',
    lines: [
      'Hyperdense region consistent with acute intracranial hemorrhage.',
      'Represents blood extravasation into brain parenchyma or surrounding spaces.',
      'Assess for mass effect, midline shift, and ventricular involvement.',
      'Model: Hemorrhage segmentation (Stage 1).',
    ],
  },
  ischemic: {
    title: 'Ischemic Territory',
    headerCls: 'text-blue-600',
    borderCls: 'border-blue-200 bg-blue-50',
    textCls: 'text-blue-800',
    lines: [
      'Hypodense region suggesting acute ischemic change.',
      'May represent infarcted core or penumbral tissue with reduced perfusion.',
      'Correlate with DWI/PWI if available for tissue viability assessment.',
      'Model: Ischemic segmentation (Stage 2).',
    ],
  },
}

// ---------------------------------------------------------------------------
// Floating tooltip rendered into document.body via portal
// ---------------------------------------------------------------------------
function FloatingTooltip({ info, clientX, clientY, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: clientX + 14, top: clientY - 16 })

  useEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = clientX + 14
    let top  = clientY - 16
    if (left + width  > vw - 8) left = clientX - width - 14
    if (top  + height > vh - 8) top  = vh - height - 8
    if (top < 8) top = 8
    setPos({ left, top })
  }, [clientX, clientY])

  return createPortal(
    <div
      ref={ref}
      className={`fixed z-50 w-64 rounded-xl border shadow-2xl p-3 font-inter text-xs ${info.borderCls}`}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`font-semibold text-sm leading-tight ${info.headerCls}`}>{info.title}</span>
        <button onClick={onClose} className="shrink-0 text-axia-400 hover:text-axia-600 transition-colors mt-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className={`flex flex-col gap-1 ${info.textCls}`}>
        {info.lines.map((line, i) => (
          <li key={i} className="leading-relaxed flex gap-1.5">
            <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-current opacity-60" />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-axia-400 italic text-[10px]">Press Esc or click image again to close.</p>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Lightbox modal with scroll-to-zoom
// ---------------------------------------------------------------------------
function Lightbox({ fileEntry, maskImage, showMask, onClose }) {
  const [scale, setScale] = useState(1)
  const MIN = 0.5, MAX = 6

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const onWheel = (e) => {
    e.preventDefault()
    setScale(s => Math.min(MAX, Math.max(MIN, s - e.deltaY * 0.001)))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center overflow-hidden"
      onClick={onClose}
      onWheel={onWheel}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10">
        <X className="w-7 h-7" />
      </button>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs font-inter pointer-events-none">
        Scroll to zoom · Click outside to close
      </p>
      <div
        className="relative"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center', transition: 'transform 0.1s' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={fileEntry.url}
          alt={fileEntry.name}
          className="max-w-[85vw] max-h-[85vh] object-contain rounded-xl"
          draggable={false}
        />
        {showMask && maskImage && (
          <img
            src={maskImage}
            alt="segmentation mask"
            className="absolute inset-0 w-full h-full object-contain rounded-xl pointer-events-none"
            draggable={false}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ImageViewer({ fileEntry, viewMode, classification, maskFound, maskImage, masksLoading }) {
  const [loaded, setLoaded]       = useState(false)
  const [tooltip, setTooltip]     = useState(null)   // { clientX, clientY }
  const [lightbox, setLightbox]   = useState(false)
  const containerRef              = useRef(null)

  // Close tooltip on Escape
  useEffect(() => {
    if (!tooltip) return
    const handler = (e) => { if (e.key === 'Escape') setTooltip(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tooltip])

  if (!fileEntry) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-axia-300 p-8">
        <ImageIcon className="w-12 h-12" strokeWidth={1} />
        <p className="text-sm font-inter">No image selected</p>
      </div>
    )
  }

  if (!fileEntry.url) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-xl bg-axia-100 flex items-center justify-center">
          <span className="font-mono text-axia-400 text-sm font-bold">DCM</span>
        </div>
        <p className="text-axia-500 text-sm font-inter font-medium">{fileEntry.name}</p>
        <p className="text-axia-300 text-xs font-inter">
          Start the backend (<code className="bg-axia-100 px-1 rounded">python app.py</code>) to preview DICOM files
        </p>
      </div>
    )
  }

  const showMask = viewMode === 'segmented' && maskFound && !!maskImage && !masksLoading
  const info     = MASK_INFO[classification]

  const handleImageClick = (e) => {
    if (!showMask || !info) {
      setLightbox(true)
      return
    }
    if (tooltip) {
      setTooltip(null)
    } else {
      setTooltip({ clientX: e.clientX, clientY: e.clientY })
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Image area */}
      <div className="relative w-full flex items-center justify-center p-2">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border-2 border-axia-200 border-t-axia-400 animate-spin" />
          </div>
        )}

        <div
          ref={containerRef}
          className={`relative inline-flex group ${showMask && info ? 'cursor-crosshair' : 'cursor-zoom-in'}`}
          style={{ visibility: loaded ? 'visible' : 'hidden' }}
          onClick={handleImageClick}
        >
          <img
            src={fileEntry.url}
            alt={fileEntry.name}
            onLoad={() => setLoaded(true)}
            className="max-w-full max-h-[480px] object-contain rounded-xl block"
            draggable={false}
          />

          {showMask && maskImage && (
            <img
              src={maskImage}
              alt="segmentation mask"
              className="absolute inset-0 w-full h-full object-contain rounded-xl pointer-events-none"
              draggable={false}
            />
          )}

          {/* Expand button */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(true) }}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/30 text-white/70 hover:bg-black/50 hover:text-white transition-all opacity-0 group-hover:opacity-100"
            title="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hint — below image when mask active and no tooltip open */}
      {showMask && info && !tooltip && loaded && (
        <p className="text-[10px] font-inter text-axia-400 text-center select-none">
          Click coloured area for lesion details
        </p>
      )}

      {/* Tooltip portal */}
      {tooltip && info && (
        <FloatingTooltip
          info={info}
          clientX={tooltip.clientX}
          clientY={tooltip.clientY}
          onClose={() => setTooltip(null)}
        />
      )}

      {/* Lightbox portal */}
      {lightbox && (
        <Lightbox
          fileEntry={fileEntry}
          maskImage={maskImage}
          showMask={showMask}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  )
}

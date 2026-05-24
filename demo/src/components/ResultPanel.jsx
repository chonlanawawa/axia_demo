import { CheckCircle, AlertCircle, HelpCircle, Info, Timer } from 'lucide-react'

const CLASSIFICATION_CONFIG = {
  hemorrhage: {
    label: 'Hemorrhage',
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    dot: 'bg-red-400',
  },
  ischemic: {
    label: 'Ischemic',
    icon: AlertCircle,
    color: 'text-blue-500',
    bg: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-400',
  },
  normal: {
    label: 'No Findings',
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-50 border-green-200',
    dot: 'bg-green-400',
  },
  indeterminate: {
    label: 'Indeterminate',
    icon: HelpCircle,
    color: 'text-amber-500',
    bg: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-400',
  },
}


function Row({ label, value, sub }) {
  if (value == null || value === '' || value === '-') return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-inter text-axia-400 uppercase tracking-wider">{label}</span>
      <span className="font-inter text-axia-600 font-medium">{value}</span>
      {sub && <span className="text-xs text-axia-400">{sub}</span>}
    </div>
  )
}

function fmtMs(ms) {
  if (ms == null) return null
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

export default function ResultPanel({ results, currentSlice, masksLoading }) {
  const cfg = CLASSIFICATION_CONFIG[results.type] || CLASSIFICATION_CONFIG.normal
  const Icon = cfg.icon

  // Per-slice values take priority; fall back to study-level aggregates
  const displayVolume  = currentSlice?.volume        ?? results.volume
  const displayShift   = currentSlice?.midlineShift  ?? results.midlineShift

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Classification badge */}
      <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${cfg.bg}`}>
        <Icon className={`w-6 h-6 ${cfg.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-inter text-axia-400 uppercase tracking-wider">Classification</p>
          <p className={`font-inter font-semibold text-lg ${cfg.color}`}>{cfg.label}</p>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
      </div>

      {/* Mask status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${results.maskFound ? 'bg-axia-400' : 'bg-axia-200'}`} />
        <span className="font-inter text-axia-500 text-sm">
          {results.maskFound ? 'Segmentation mask found' : 'No mask detected'}
        </span>
      </div>

      {/* Segmentation development warning */}
      {results.maskFound && (
        <div className="flex items-start gap-2 text-xs font-inter text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
          <span>Segmentation mask is under development — results may be inaccurate and should not be used for clinical decisions.</span>
        </div>
      )}

      {/* ── Hemorrhage-specific ── */}
      {results.type === 'hemorrhage' && (
        <div className="flex flex-col gap-4 pt-2 border-t border-axia-100">
          {displayVolume != null && (
            <Row label="Estimated volume" value={`${displayVolume} mL`} sub="From DICOM spacing + mask" />
          )}
          {displayShift != null && (
            <Row label="Midline shift" value={`${displayShift} mm`} sub="From CT geometry + DICOM spacing" />
          )}
          {(displayVolume == null && displayShift == null) && (
            <div className="flex items-start gap-2 text-xs font-inter text-axia-400 bg-axia-50 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Volume & midline shift require DICOM input with spacing metadata.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Ischemic-specific ── */}
      {results.type === 'ischemic' && (
        <div className="flex flex-col gap-4 pt-2 border-t border-axia-100">
          {displayVolume != null && (
            <Row label="Estimated volume" value={`${displayVolume} mL`} sub="From DICOM spacing + mask" />
          )}
          {displayShift != null && (
            <Row label="Midline shift" value={`${displayShift} mm`} sub="From CT geometry + DICOM spacing" />
          )}
          {(displayVolume == null && displayShift == null) && (
            <div className="flex items-start gap-2 text-xs font-inter text-axia-400 bg-axia-50 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Volume & midline shift require DICOM input with spacing metadata.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Normal ── */}
      {results.type === 'normal' && (
        <div className="flex flex-col gap-3 pt-2 border-t border-axia-100">
          <p className="font-inter text-axia-500 text-sm italic">{results.message}</p>
          <div className="flex flex-col gap-1.5 text-xs font-inter text-axia-400">
            <div className="flex justify-between">
              <span>Hemorrhage probability</span>
              <span className="font-mono">{Math.round((results.stage1Score ?? 0) * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Ischemia probability</span>
              <span className="font-mono">{Math.round((results.stage2Score ?? 0) * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Timing ── */}
      {(results.classificationMs != null || results.segmentationMs != null) && (
        <div className="pt-2 border-t border-axia-100 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-inter text-axia-400 uppercase tracking-wider">
            <Timer className="w-3 h-3" />
            Processing time
          </div>
          <div className="flex gap-4 text-xs font-mono text-axia-500">
            {results.classificationMs != null && (
              <span>Classification: <span className="font-semibold">{fmtMs(results.classificationMs)}</span></span>
            )}
            {masksLoading ? (
              <span className="flex items-center gap-1 text-axia-400">
                Segmentation: <span className="w-3 h-3 rounded-full border border-axia-300 border-t-axia-500 animate-spin ml-1" />
              </span>
            ) : results.segmentationMs != null ? (
              <span>Segmentation: <span className="font-semibold">{fmtMs(results.segmentationMs)}</span></span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Indeterminate ── */}
      {results.type === 'indeterminate' && (
        <div className="flex flex-col gap-3 pt-2 border-t border-axia-100">
          <div className="flex items-start gap-2 text-xs font-inter text-amber-600 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
            <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{results.message}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-xs font-inter text-axia-400">
            <div className="flex justify-between">
              <span>Hemorrhage probability</span>
              <span className="font-mono text-amber-500">{Math.round((results.stage1Score ?? 0) * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Ischemia probability</span>
              <span className="font-mono text-amber-500">{Math.round((results.stage2Score ?? 0) * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

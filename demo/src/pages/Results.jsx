import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Navbar from '../components/Navbar'
import ImageViewer from '../components/ImageViewer'
import ResultPanel from '../components/ResultPanel'
import SaveModal from '../components/SaveModal'

export default function Results() {
  const { uploadedFiles, mode, results, masksLoading, reset } = useApp()
  const navigate = useNavigate()

  const [viewMode, setViewMode]       = useState('original')
  const [activeIndex, setActiveIndex] = useState(0)
  const [showSave, setShowSave]       = useState(false)

  if (!results || !uploadedFiles.length) {
    return (
      <div className="min-h-screen bg-axia-gradient flex items-center justify-center">
        <div className="text-axia-400 font-inter">No results found.{' '}
          <button className="underline" onClick={() => navigate('/upload')}>Go back</button>
        </div>
      </div>
    )
  }

  const currentFile  = uploadedFiles[activeIndex]
  const currentSlice = results.sliceResults?.[activeIndex]
  const slicesWithLesion = results.sliceResults?.filter(s => s.maskFound).length ?? 0
  const totalSlices      = uploadedFiles.length

  const currentHasLesion = currentSlice?.maskFound ?? false

  const handleAgain = () => { reset(); navigate('/upload') }

  const lesionColor = results.type === 'hemorrhage' ? 'border-red-400'
                    : results.type === 'ischemic'   ? 'border-blue-400'
                    : 'border-axia-400'
  const lesionDot   = results.type === 'hemorrhage' ? 'bg-red-400'
                    : results.type === 'ischemic'   ? 'bg-blue-400'
                    : 'bg-axia-400'

  // Can only switch to segmented once masks are done and at least one found
  const canSegment = !masksLoading && results.maskFound

  return (
    <div className="min-h-screen bg-axia-gradient flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col px-6 py-8 gap-6 max-w-7xl mx-auto w-full">

        {/* ── Header: study-level summary ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-inter text-axia-400 text-sm">
            {mode === 'single' ? '1 slice' : `${totalSlices} slices`}
          </span>

          {results.maskFound && mode === 'multi' && (
            <span className="text-xs font-inter bg-axia-100 text-axia-500 px-2.5 py-0.5 rounded-full border border-axia-200">
              Lesion found in {slicesWithLesion} / {totalSlices} slices
            </span>
          )}
          {results.maskFound && mode === 'single' && (
            <span className="text-xs font-inter bg-axia-100 text-axia-500 px-2.5 py-0.5 rounded-full border border-axia-200">
              Lesion detected
            </span>
          )}

          {/* Mask loading badge */}
          {masksLoading && (
            <span className="flex items-center gap-1.5 text-xs font-inter text-axia-500 bg-white/60 px-2.5 py-0.5 rounded-full border border-axia-200">
              <span className="w-3 h-3 rounded-full border-2 border-axia-300 border-t-axia-500 animate-spin inline-block" />
              Generating masks…
            </span>
          )}
        </div>

        {/* Mask loading progress bar */}
        {masksLoading && (
          <div className="w-full h-1 bg-axia-100 rounded-full overflow-hidden -mt-4">
            <div className="h-full bg-axia-400 rounded-full animate-loading-bar" />
          </div>
        )}

        {/* ── Main layout ── */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1">

          {/* LEFT: image panel */}
          <div className="flex flex-col gap-3 lg:w-[55%]">

            {/* Main viewer */}
            <div className="relative rounded-2xl border-2 border-dashed border-axia-300 bg-white/30 overflow-hidden flex items-center justify-center min-h-[340px] max-h-[480px]">

              <ImageViewer
                fileEntry={currentFile}
                viewMode={viewMode}
                classification={results.type}
                maskFound={currentHasLesion}
                maskImage={currentSlice?.maskImage ?? null}
                masksLoading={masksLoading}
              />

              {/* No-lesion notice when user switches to segmented on a clean slice */}
              {viewMode === 'segmented' && !currentHasLesion && results.maskFound && !masksLoading && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-black/40 text-white text-xs font-inter px-3 py-1.5 rounded-full whitespace-nowrap">
                  No lesion in this slice
                </div>
              )}

              {/* Original / Segmented toggle */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/60 backdrop-blur-sm rounded-full px-2 py-1.5 shadow-sm">
                <button
                  onClick={() => setViewMode('original')}
                  className={`text-xs font-inter font-medium px-3 py-1 rounded-full transition-all ${
                    viewMode === 'original' ? 'bg-axia-400 text-white' : 'text-axia-500 hover:text-axia-700'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => canSegment && setViewMode('segmented')}
                  disabled={!canSegment}
                  className={`text-xs font-inter font-medium px-3 py-1 rounded-full transition-all ${
                    viewMode === 'segmented'
                      ? 'bg-axia-400 text-white'
                      : canSegment
                        ? 'text-axia-500 hover:text-axia-700'
                        : 'text-axia-300 cursor-not-allowed'
                  }`}
                >
                  {masksLoading ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-axia-300 border-t-axia-400 animate-spin" />
                      Segmenting…
                    </span>
                  ) : 'Segmented'}
                </button>
              </div>
            </div>

            {/* Gallery — multi mode */}
            {mode === 'multi' && uploadedFiles.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-inter text-axia-400 uppercase tracking-wider">
                  Slices —{' '}
                  <span className={results.type === 'hemorrhage' ? 'text-red-400' : 'text-blue-400'}>
                    coloured border = lesion present
                  </span>
                </p>
                <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                  {uploadedFiles.map((f, i) => {
                    const sr = results.sliceResults?.[i]
                    const hasLesion = sr?.maskFound ?? false
                    return (
                      <button
                        key={i}
                        onClick={() => { setActiveIndex(i); setViewMode('original') }}
                        title={hasLesion ? 'Lesion present' : 'No lesion'}
                        className={`
                          shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
                          ${activeIndex === i ? 'scale-105 shadow-md' : 'hover:scale-[1.03]'}
                          ${hasLesion ? lesionColor : 'border-axia-200'}
                        `}
                      >
                        {f.url
                          ? <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-axia-100 flex items-center justify-center text-[9px] text-axia-400 font-inter text-center px-1 leading-tight">
                              {f.name}
                            </div>
                        }
                        {hasLesion && (
                          <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${lesionDot} border border-white`} />
                        )}
                        {masksLoading && (
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 bg-black/30 text-white text-[8px] text-center py-0.5">
                          {i + 1}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px bg-axia-200 self-stretch" />

          {/* RIGHT: results + actions */}
          <div className="flex flex-col gap-6 lg:flex-1">
            <ResultPanel results={results} currentSlice={currentSlice} masksLoading={masksLoading} />

            <div className="pt-4 border-t border-axia-200 flex items-center gap-4">
              <span className="font-inter text-axia-500 text-sm font-medium">Save Output (CSV)</span>
              <button
                onClick={() => setShowSave(true)}
                className="text-xs bg-axia-400 text-white px-4 py-1.5 rounded-full hover:bg-axia-500 transition-colors font-inter"
              >
                Yes — Export
              </button>
            </div>

            <div className="mt-auto">
              <button
                onClick={handleAgain}
                className="font-inter text-axia-400 hover:text-axia-600 text-sm underline transition-colors"
              >
                Analyze again?
              </button>
            </div>
          </div>
        </div>
      </main>

      {showSave && (
        <SaveModal results={results} files={uploadedFiles} onClose={() => setShowSave(false)} />
      )}
    </div>
  )
}

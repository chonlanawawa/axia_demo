import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Processing() {
  const { isProcessing, results } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    // Navigate as soon as classification is done (results set, isProcessing false)
    if (!isProcessing && results) {
      navigate('/results', { replace: true })
    }
    if (!isProcessing && !results) {
      navigate('/upload', { replace: true })
    }
  }, [isProcessing, results, navigate])

  return (
    <div className="min-h-screen bg-axia-gradient flex flex-col items-center justify-center gap-8">
      {/* Spinner ring */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-axia-200" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-axia-400 animate-spin" />
      </div>

      <p className="font-inter font-semibold text-2xl text-axia-500 animate-pulse-slow tracking-widest">
        Classifying…
      </p>

      <p className="font-inter text-axia-400 text-sm text-center max-w-xs">
        Running hemorrhage and ischemic detection models
      </p>

      <div className="flex flex-col gap-2 mt-2 text-left">
        {[
          'Stage 1 — Hemorrhage detection',
          'Stage 2 — Ischemic classification',
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-axia-400 text-sm font-inter">
            <div
              className="w-1.5 h-1.5 rounded-full bg-axia-300 animate-pulse"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
            {step}
          </div>
        ))}
      </div>
    </div>
  )
}

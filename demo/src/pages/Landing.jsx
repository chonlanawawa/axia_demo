import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Landing() {
  const navigate = useNavigate()
  const { reset } = useApp()

  const handleStart = () => {
    reset()
    navigate('/upload')
  }

  return (
    <div className="min-h-screen bg-axia-gradient flex flex-col items-center justify-center select-none">
      {/* AXIA Logo */}
      <div className="animate-fade-in flex flex-col items-center gap-6">
        <h1
          className="font-orbitron font-black text-[clamp(5rem,14vw,10rem)] tracking-[0.2em] text-axia-300"
          style={{ textShadow: '0 4px 32px rgba(100,195,230,0.25), 0 1px 0 rgba(255,255,255,0.6)' }}
        >
          AXIA
        </h1>

        <p className="font-inter text-axia-500 text-lg md:text-xl tracking-wide text-center max-w-lg px-4">
          Automated X-sectional Intracranial Analysis for Acute Stroke
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={handleStart}
        className="
          mt-16 animate-slide-up
          font-inter font-medium text-xl text-white
          bg-axia-400 hover:bg-axia-500
          px-14 py-4 rounded-full
          shadow-lg shadow-axia-300/40
          transition-all duration-200
          hover:scale-105 hover:shadow-xl hover:shadow-axia-300/50
          active:scale-95
        "
        style={{ animationDelay: '0.25s' }}
      >
        Get Started
      </button>

      {/* History link */}
      <button
        onClick={() => navigate('/history')}
        className="mt-6 text-axia-400 hover:text-axia-600 text-sm font-inter transition-colors"
        style={{ animationDelay: '0.4s' }}
      >
        View History Logs →
      </button>
    </div>
  )
}

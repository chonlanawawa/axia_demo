import { useNavigate, useLocation } from 'react-router-dom'
import { Clock, Home } from 'lucide-react'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 bg-white/30 backdrop-blur-sm border-b border-axia-100">
      {/* Brand */}
      <button
        onClick={() => navigate('/')}
        className="font-orbitron font-bold text-2xl text-axia-400 tracking-[0.15em] hover:text-axia-500 transition-colors"
      >
        AXIA
      </button>

      {/* Nav links */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/upload')}
          className={`flex items-center gap-1.5 text-sm font-inter transition-colors ${
            location.pathname === '/upload'
              ? 'text-axia-500 font-medium'
              : 'text-axia-400 hover:text-axia-600'
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="hidden sm:inline">Analyze</span>
        </button>
        <button
          onClick={() => navigate('/history')}
          className={`flex items-center gap-1.5 text-sm font-inter transition-colors ${
            location.pathname === '/history'
              ? 'text-axia-500 font-medium'
              : 'text-axia-400 hover:text-axia-600'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>
      </div>
    </nav>
  )
}

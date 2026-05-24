import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { downloadCsv, buildCsvRows } from '../utils/csvExport'
import { Download, Eye, Trash2 } from 'lucide-react'

const TYPE_STYLES = {
  hemorrhage:    'bg-red-100 text-red-600 border-red-200',
  ischemic:      'bg-blue-100 text-blue-600 border-blue-200',
  normal:        'bg-green-100 text-green-600 border-green-200',
  indeterminate: 'bg-amber-100 text-amber-600 border-amber-200',
}

const TYPE_LABELS = {
  hemorrhage:    'Hemorrhage',
  ischemic:      'Ischemic',
  normal:        'No Findings',
  indeterminate: 'Indeterminate',
}

function Badge({ type }) {
  return (
    <span className={`text-xs font-inter font-medium px-2.5 py-0.5 rounded-full border ${TYPE_STYLES[type] || 'bg-axia-100 text-axia-500'}`}>
      {TYPE_LABELS[type] || type}
    </span>
  )
}

export default function History() {
  const navigate = useNavigate()
  const [history, setHistory] = useState([])

  useEffect(() => {
    const raw = localStorage.getItem('axia_history')
    if (raw) setHistory(JSON.parse(raw))
  }, [])

  const clearHistory = () => {
    if (!window.confirm('Clear all history?')) return
    localStorage.removeItem('axia_history')
    setHistory([])
  }

  const deleteEntry = (caseId) => {
    const updated = history.filter(h => h.caseId !== caseId)
    localStorage.setItem('axia_history', JSON.stringify(updated))
    setHistory(updated)
  }

  const downloadEntry = (entry) => {
    const mockFiles = (entry.sliceFilenames || []).map(name => ({ name }))
    const mockResults = {
      type: entry.type,
      confidence: entry.confidence,
      maskFound: entry.maskFound,
      subtypes: entry.subtypes,
      subtype: entry.subtype,
      aspects: entry.aspects,
      volume: entry.volume,
      midlineShift: entry.midlineShift,
      sliceResults: mockFiles.map(() => ({ maskFound: false, confidence: 0 })),
    }
    const meta = { patientName: entry.patientName, patientId: entry.patientId, date: entry.date }
    const { rows } = buildCsvRows(mockResults, meta, mockFiles)
    downloadCsv(rows, `${entry.caseId}.csv`)
  }

  return (
    <div className="min-h-screen bg-axia-gradient flex flex-col">
      <Navbar />

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-inter text-axia-600 text-2xl font-semibold">History Logs</h2>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-600 font-inter flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-axia-400 font-inter">
            <p className="text-lg">No history yet</p>
            <button
              onClick={() => navigate('/upload')}
              className="text-sm underline hover:text-axia-600 transition-colors"
            >
              Analyze a scan to get started
            </button>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-axia-200 bg-white/40 backdrop-blur-sm">
            <table className="w-full text-sm font-inter">
              <thead>
                <tr className="bg-axia-100/60 text-axia-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Case ID</th>
                  <th className="text-left px-4 py-3">Patient</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Classification</th>
                  <th className="text-left px-4 py-3">Mask</th>
                  <th className="text-left px-4 py-3">Slices</th>
                  <th className="text-left px-4 py-3">Details</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-axia-100">
                {history.map((entry) => (
                  <tr key={entry.caseId} className="hover:bg-axia-50/50 transition-colors">
                    <td className="px-4 py-3 text-axia-600 font-mono text-xs">{entry.caseId}</td>
                    <td className="px-4 py-3 text-axia-600">
                      {entry.patientName
                        ? <div>
                            <p className="font-medium">{entry.patientName}</p>
                            <p className="text-axia-400 text-xs">{entry.patientId || '—'}</p>
                          </div>
                        : <span className="text-axia-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-axia-500 whitespace-nowrap">{entry.date}</td>
                    <td className="px-4 py-3"><Badge type={entry.type} /></td>
                    <td className="px-4 py-3">
                      {entry.maskFound
                        ? <span className="text-axia-500 text-xs">Found</span>
                        : <span className="text-axia-300 text-xs">Not found</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-axia-500">{entry.sliceCount}</td>
                    <td className="px-4 py-3 text-axia-400 text-xs">
                      {entry.type === 'ischemic'
                        ? `ASPECTS ${entry.aspects ?? '—'}`
                        : entry.type === 'hemorrhage' && entry.volume != null
                        ? `${entry.volume} mL`
                        : '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          title="Download CSV"
                          onClick={() => downloadEntry(entry)}
                          className="p-1.5 rounded-lg hover:bg-axia-100 text-axia-400 hover:text-axia-600 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteEntry(entry.caseId)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-axia-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

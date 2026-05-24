import { useState } from 'react'
import { X, Download } from 'lucide-react'
import { buildCsvRows, downloadCsv, saveToHistory } from '../utils/csvExport'

export default function SaveModal({ results, files, onClose }) {
  const [form, setForm] = useState({ patientName: '', patientId: '', date: new Date().toISOString().split('T')[0] })
  const [saved, setSaved] = useState(false)

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleExport = () => {
    const { caseId, rows } = buildCsvRows(results, form, files)
    downloadCsv(rows, `${caseId}.csv`)
    saveToHistory(caseId, results, form, files)
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border border-axia-200 w-full max-w-md p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-inter font-semibold text-axia-600 text-lg">Export Results</h3>
          <button onClick={onClose} className="text-axia-300 hover:text-axia-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!saved ? (
          <>
            {/* Optional patient info */}
            <p className="text-xs font-inter text-axia-400 mb-4">
              Patient metadata is optional — leave blank to export anonymised.
            </p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-inter text-axia-500 uppercase tracking-wider">Patient Name</span>
                <input
                  name="patientName"
                  value={form.patientName}
                  onChange={handleChange}
                  placeholder="e.g. John Doe"
                  className="
                    rounded-lg border border-axia-200 bg-white/60 px-3 py-2
                    text-sm font-inter text-axia-600 placeholder-axia-300
                    focus:outline-none focus:ring-2 focus:ring-axia-300
                  "
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-inter text-axia-500 uppercase tracking-wider">Patient ID</span>
                <input
                  name="patientId"
                  value={form.patientId}
                  onChange={handleChange}
                  placeholder="e.g. PT-00123"
                  className="
                    rounded-lg border border-axia-200 bg-white/60 px-3 py-2
                    text-sm font-inter text-axia-600 placeholder-axia-300
                    focus:outline-none focus:ring-2 focus:ring-axia-300
                  "
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-inter text-axia-500 uppercase tracking-wider">Date</span>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="
                    rounded-lg border border-axia-200 bg-white/60 px-3 py-2
                    text-sm font-inter text-axia-600
                    focus:outline-none focus:ring-2 focus:ring-axia-300
                  "
                />
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-axia-200 text-axia-400 text-sm font-inter hover:bg-axia-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="flex-1 py-2.5 rounded-xl bg-axia-400 text-white text-sm font-inter font-medium hover:bg-axia-500 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Download className="w-6 h-6 text-green-500" />
            </div>
            <p className="font-inter text-axia-600 font-medium">Export complete</p>
            <p className="text-sm text-axia-400 font-inter">Saved to history logs</p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 rounded-full bg-axia-400 text-white text-sm font-inter hover:bg-axia-500 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

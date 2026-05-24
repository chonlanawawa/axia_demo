export function buildCsvRows(results, meta, files) {
  const { patientName, patientId, date } = meta
  const caseId = `AXIA-${Date.now()}`

  const baseRow = {
    case_id: caseId,
    patient_name: patientName || '-',
    patient_id: patientId || '-',
    date: date || new Date().toISOString().split('T')[0],
    classification: results.type,
    confidence: results.confidence,
    mask_found: results.maskFound,
  }

  if (results.type === 'hemorrhage') {
    baseRow.volume_ml = results.volume ?? '-'
    baseRow.midline_shift_mm = results.midlineShift ?? '-'
  } else if (results.type === 'ischemic') {
    baseRow.aspects_score = results.aspects ?? '-'
  } else {
    baseRow.note = results.message || '-'
  }

  // Per-slice rows
  const rows = files.map((f, i) => {
    const sr = results.sliceResults?.[i] || {}
    return {
      ...baseRow,
      slice_index: i + 1,
      slice_filename: f.name || f.file?.name || `slice_${i + 1}`,
      slice_mask_found: sr.maskFound ?? '-',
      slice_confidence: sr.confidence ?? '-',
    }
  })

  return { caseId, rows }
}

export function downloadCsv(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h] ?? ''
        return String(v).includes(',') ? `"${v}"` : v
      }).join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function saveToHistory(caseId, results, meta, files) {
  const existing = JSON.parse(localStorage.getItem('axia_history') || '[]')
  const entry = {
    caseId,
    timestamp: new Date().toISOString(),
    patientName: meta.patientName || null,
    patientId: meta.patientId || null,
    date: meta.date || new Date().toISOString().split('T')[0],
    type: results.type,
    confidence: results.confidence,
    maskFound: results.maskFound,
    aspects: results.aspects ?? null,
    volume: results.volume ?? null,
    midlineShift: results.midlineShift ?? null,
    sliceCount: files.length,
    sliceFilenames: files.map(f => f.name || f.file?.name || 'unknown'),
  }
  existing.unshift(entry)
  localStorage.setItem('axia_history', JSON.stringify(existing.slice(0, 100)))
  return entry
}

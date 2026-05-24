// ---------------------------------------------------------------------------
// Mock inference — split into classify + segment phases to mirror the real API.
// ---------------------------------------------------------------------------

class SeededRng {
  constructor(seed) { this.s = (Math.abs(seed) % 2147483646) + 1 }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646 }
  range(min, max) { return min + this.next() * (max - min) }
  int(min, max)   { return Math.floor(this.range(min, max + 1)) }
}

function seedFromFiles(files) {
  return files.reduce((acc, f) => {
    const name = f.name || f.file?.name || 'unknown'
    return acc + name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  }, 0)
}

// Phase 1 — classification only (fast)
export function mockClassify(files) {
  const rng = new SeededRng(seedFromFiles(files))
  const stage1Score = rng.next()
  const isHemorrhage = stage1Score > 0.38

  if (isHemorrhage) {
    return {
      type:        'hemorrhage',
      stage1Score: parseFloat(stage1Score.toFixed(3)),
      confidence:  parseFloat(rng.range(0.72, 0.97).toFixed(3)),
    }
  }

  const stage2Score = rng.next()
  const isIschemic  = stage2Score > 0.27

  if (isIschemic) {
    return {
      type:        'ischemic',
      stage1Score: parseFloat(stage1Score.toFixed(3)),
      stage2Score: parseFloat(stage2Score.toFixed(3)),
      confidence:  parseFloat(rng.range(0.68, 0.95).toFixed(3)),
    }
  }

  const s1Borderline = stage1Score > 0.22 && stage1Score <= 0.39
  const s2Borderline = stage2Score > 0.15 && stage2Score <= 0.27

  if (s1Borderline || s2Borderline) {
    return {
      type:        'indeterminate',
      stage1Score: parseFloat(stage1Score.toFixed(3)),
      stage2Score: parseFloat(stage2Score.toFixed(3)),
      confidence:  parseFloat(Math.max(stage1Score, stage2Score).toFixed(3)),
      message:     'Findings inconclusive — manual review recommended',
    }
  }

  return {
    type:        'normal',
    stage1Score: parseFloat(stage1Score.toFixed(3)),
    stage2Score: parseFloat(stage2Score.toFixed(3)),
    confidence:  parseFloat(rng.range(0.78, 0.96).toFixed(3)),
    message:     'No CT evidence of hemorrhage; ischemia unlikely',
  }
}

// Phase 2 — segmentation result (mock mode: no real masks)
export function mockSegment(files, type) {
  const rng = new SeededRng(seedFromFiles(files) + 1)
  if (type === 'ischemic') {
    return {
      maskFound:     false,
      aspects:       rng.int(4, 10),
      sliceResults:  files.map(() => ({ maskFound: false, confidence: 0, maskImage: null })),
      segmentationMs: 0,
    }
  }
  return {
    maskFound:     false,
    volume:        null,
    midlineShift:  null,
    sliceResults:  files.map(() => ({ maskFound: false, confidence: 0, maskImage: null })),
    segmentationMs: 0,
  }
}

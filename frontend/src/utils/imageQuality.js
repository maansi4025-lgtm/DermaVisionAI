/**
 * Quick, on-device photo checks. Nothing is uploaded. These are rough heuristics, so they only warn;
 * they never block an upload.
 */

const MIN_SIDE = 224 // the model resizes to 224 x 224, so smaller photos get blown up and lose detail
const DARK_MEAN = 50
const BRIGHT_MEAN = 225
const BLUR_VARIANCE = 25 // variance of the Laplacian on a 256 px-wide grayscale copy
const ANALYSIS_SIZE = 256

/** Pure function so it can be tested without a browser. `gray` is a Float/Uint8 array of w*h values (0-255). */
export function analyzePixels(gray, w, h) {
  const n = w * h
  let sum = 0
  for (let i = 0; i < n; i++) sum += gray[i]
  const mean = sum / n

  // Laplacian variance: low values mean few sharp edges (blur, or a very flat photo)
  let lapSum = 0
  let lapSq = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      lapSum += lap
      lapSq += lap * lap
      count++
    }
  }
  const lapMean = count ? lapSum / count : 0
  const sharpness = count ? lapSq / count - lapMean * lapMean : 0
  return { mean, sharpness }
}

export function warningsFor({ width, height, mean, sharpness }) {
  const warnings = []
  if (Math.min(width, height) < MIN_SIDE) {
    warnings.push(
      `This photo is small (${width}×${height}). Use a larger photo, at least ${MIN_SIDE} pixels on each side.`,
    )
  }
  if (mean < DARK_MEAN) warnings.push('This photo looks very dark. Try again in daylight.')
  else if (mean > BRIGHT_MEAN) warnings.push('This photo looks overexposed. Avoid flash and strong glare.')
  if (sharpness < BLUR_VARIANCE) {
    warnings.push('This photo may be blurry. Hold the camera steady and let it focus before taking it.')
  }
  return warnings
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file)
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Returns a list of plain-language warnings (empty when the photo looks fine or could not be checked). */
export async function checkImageQuality(file) {
  try {
    const bmp = await loadBitmap(file)
    const width = bmp.width
    const height = bmp.height
    const scale = Math.min(1, ANALYSIS_SIZE / Math.max(width, height))
    const w = Math.max(3, Math.round(width * scale))
    const h = Math.max(3, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const { data } = ctx.getImageData(0, 0, w, h)
    const gray = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    }
    return warningsFor({ width, height, ...analyzePixels(gray, w, h) })
  } catch {
    return []
  }
}
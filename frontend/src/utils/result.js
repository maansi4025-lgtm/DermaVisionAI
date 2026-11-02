/** Helpers that turn a scan into wording a patient can understand. */

// Keep in sync with LOW_CONFIDENCE in backend/app/services/lesion_info.py
export const LOW_CONFIDENCE = 0.5

export const isLowConfidence = (scan) =>
  typeof scan?.confidence === 'number' && scan.confidence < LOW_CONFIDENCE

/** Short label for badges in lists: an uncertain result is not shown as a diagnosis-like name. */
export const badgeLabel = (scan) => (isLowConfidence(scan) ? 'Uncertain result' : scan?.prediction)

// Plain-language meaning per category name (the names the backend sends).
const PLAIN = {
  Melanoma: {
    headline: 'Looks similar to a type of skin cancer',
    meaning:
      'The AI found features that resemble melanoma. Melanoma is very treatable when it is found early, but a photo cannot confirm it. Only a dermatologist can.',
    serious: true,
  },
  'Basal cell carcinoma': {
    headline: 'Looks similar to a common, slow-growing skin cancer',
    meaning:
      'The AI found features that resemble basal cell carcinoma, the most common skin cancer. It is usually very treatable, but a doctor needs to check it.',
    serious: true,
  },
  'Actinic keratosis': {
    headline: 'Looks like a rough, sun-damaged patch',
    meaning:
      'These patches are caused by years of sun exposure. Some can turn into skin cancer if left alone, so it is worth having it looked at.',
    serious: false,
  },
  'Benign keratosis-like lesion': {
    headline: 'Looks like a harmless skin growth',
    meaning:
      'This type of spot, like an age spot or a sun spot, is usually harmless. Watch it for changes.',
    serious: false,
    harmless: true,
  },
  Dermatofibroma: {
    headline: 'Looks like a harmless firm bump',
    meaning: 'Dermatofibromas are common, harmless skin bumps. Watch it for changes.',
    serious: false,
    harmless: true,
  },
  'Melanocytic nevus': {
    headline: 'Looks like an ordinary mole',
    meaning: 'Most moles are harmless. See a doctor if it changes in size, shape or colour, bleeds or itches.',
    serious: false,
    harmless: true,
  },
  'Vascular lesion': {
    headline: 'Looks like a harmless blood-vessel spot',
    meaning: 'Spots like these are usually harmless. See a doctor if it bleeds or changes.',
    serious: false,
    harmless: true,
  },
}

const GENERIC = {
  high: {
    headline: 'Some features need a closer look',
    meaning:
      'The result shows a meaningful chance of a more serious skin condition. Only a dermatologist can tell what it is.',
  },
  medium: {
    headline: 'This spot is worth getting checked',
    meaning: 'The result is not clear-cut. A dermatologist can tell you what it is.',
  },
  low: {
    headline: 'No strong warning signs in this photo',
    meaning: 'Keep an eye on the spot and see a doctor if it changes.',
  },
}

export const UNCERTAIN = {
  headline: 'Not sure. Please see a doctor.',
  meaning:
    'The AI could not match this photo to a skin condition with enough confidence, so it is not showing a guess as the answer. A doctor can look at it in person. If you retake the photo, use daylight and hold the camera steady.',
}

/**
 * Headline and meaning for a scan. The wording never sounds calmer than the risk level:
 * a "harmless" category is not shown when the risk is medium or high.
 */
export function plainSummary(scan) {
  if (isLowConfidence(scan)) return UNCERTAIN
  const level = scan?.risk_level ?? 'medium'
  const known = PLAIN[scan?.prediction]
  if (!known) return GENERIC[level] ?? GENERIC.medium
  if (level === 'high' && !known.serious) return GENERIC.high
  if (level !== 'low' && known.harmless) return GENERIC[level]
  return known
}
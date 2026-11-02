const PLACEHOLDER_IMAGE =
  '/images/lesion-placeholder.svg'

const PLACEHOLDER_GRADCAM =
  '/images/gradcam-placeholder.svg'

export const MOCK_USER = {
  id: 'usr_001',
  full_name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  member_since: '2024-03-15',
  avatar_url: null,
}

export const MOCK_SCANS = [
  {
    id: 'scan_1042',
    scan_number: 1042,
    image_url: PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: '2026-09-20T14:32:00Z',
    prediction: 'Benign',
    risk_level: 'low',
    confidence: 0.94,
    top_classes: [
      { label: 'Benign', probability: 0.94 },
      { label: 'Melanocytic nevus', probability: 0.04 },
      { label: 'Seborrheic keratosis', probability: 0.02 },
    ],
    insight:
      'The model identified patterns consistent with a benign lesion. Regular self-monitoring and professional check-ups are still recommended.',
  },
  {
    id: 'scan_1038',
    scan_number: 1038,
    image_url: PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: '2026-09-12T09:15:00Z',
    prediction: 'Melanocytic nevus',
    risk_level: 'medium',
    confidence: 0.87,
    top_classes: [
      { label: 'Melanocytic nevus', probability: 0.87 },
      { label: 'Benign', probability: 0.08 },
      { label: 'Basal cell carcinoma', probability: 0.05 },
    ],
    insight:
      'Features suggest a melanocytic nevus. Consider scheduling a dermatologist visit if the lesion changes in size, shape, or color.',
  },
  {
    id: 'scan_1025',
    scan_number: 1025,
    image_url: PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: '2026-08-28T16:45:00Z',
    prediction: 'Benign',
    risk_level: 'low',
    confidence: 0.91,
    top_classes: [
      { label: 'Benign', probability: 0.91 },
      { label: 'Dermatofibroma', probability: 0.06 },
      { label: 'Vascular lesion', probability: 0.03 },
    ],
    insight: 'Low-risk classification with stable visual indicators in this screening image.',
  },
  {
    id: 'scan_1011',
    scan_number: 1011,
    image_url: PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: '2026-08-10T11:20:00Z',
    prediction: 'Seborrheic keratosis',
    risk_level: 'low',
    confidence: 0.89,
    top_classes: [
      { label: 'Seborrheic keratosis', probability: 0.89 },
      { label: 'Benign', probability: 0.07 },
      { label: 'Melanoma', probability: 0.04 },
    ],
    insight: 'Common benign growth pattern detected. Monitor for irritation or rapid change.',
  },
  {
    id: 'scan_0998',
    scan_number: 998,
    image_url: PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: '2026-07-22T08:05:00Z',
    prediction: 'Basal cell carcinoma',
    risk_level: 'high',
    confidence: 0.82,
    top_classes: [
      { label: 'Basal cell carcinoma', probability: 0.82 },
      { label: 'Actinic keratosis', probability: 0.11 },
      { label: 'Benign', probability: 0.07 },
    ],
    insight:
      'Elevated-risk indicators detected. Please consult a qualified dermatologist promptly for clinical evaluation.',
  },
]

export function mockDashboardStats(scans = MOCK_SCANS) {
  const sorted = [...scans].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  )
  const last = sorted[0]
  return {
    total_scans: scans.length,
    last_scan_date: last?.created_at ?? null,
    next_follow_up: '2026-10-20',
    ai_analysis_available: true,
    recent_scans: sorted.slice(0, 4),
  }
}

export function mockUploadResult(previewUrl, scanNumber = 1043) {
  return {
    id: `scan_${Date.now()}`,
    scan_number: scanNumber,
    image_url: previewUrl || PLACEHOLDER_IMAGE,
    gradcam_image_url: PLACEHOLDER_GRADCAM,
    created_at: new Date().toISOString(),
    prediction: 'Benign',
    risk_level: 'low',
    confidence: 0.92,
    top_classes: [
      { label: 'Benign', probability: 0.92 },
      { label: 'Melanocytic nevus', probability: 0.05 },
      { label: 'Seborrheic keratosis', probability: 0.03 },
    ],
    insight:
      'Your scan shows features commonly associated with benign skin lesions. Continue routine skin checks and follow up with a dermatologist for any concerns.',
  }
}

export function mockChatReply(sessionId) {
  return {
    session_id: sessionId || 'sess_mock',
    reply:
      'Demo mode: the assistant is not connected to the backend. Set VITE_USE_MOCK=false and start the API to chat for real.',
    urgency: 'routine',
    red_flags: [],
    quick_replies: [],
    emergency: false,
  }
}

export { PLACEHOLDER_IMAGE, PLACEHOLDER_GRADCAM }

import axios from 'axios'
import {
  MOCK_SCANS,
  MOCK_USER,
  mockChatReply,
  mockDashboardStats,
  mockUploadResult,
} from './mockData'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const mockScans = [...MOCK_SCANS]

/** JWT kept in memory only (not localStorage). */
let accessToken = null

export function setAccessToken(token) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function clearAccessToken() {
  accessToken = null
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// On 401, silently refresh the access token once (httpOnly cookie) and retry the original request.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const isAuthCall = original?.url?.includes('/api/auth/')
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true
      try {
        const { data } = await api.post('/api/auth/refresh')
        setAccessToken(data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        clearAccessToken()
        sessionStorage.removeItem('dv_user')
        window.location.assign('/login')
      }
    }
    throw error
  },
)

function delay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Mock mode (VITE_USE_MOCK=true) returns fake data. Otherwise every call goes to the real backend and errors surface. */
async function withMockFallback(requestFn, mockFn) {
  if (!USE_MOCK) return requestFn()
  await delay()
  return mockFn()
}

/** Quick reachability test used by the login pages. Always ok in mock mode. */
export async function checkBackend() {
  if (USE_MOCK) return { ok: true, mock: true }
  try {
    await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Turn any API error into a message a user can act on. */
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err?.response) {
    return `Cannot reach the server. Make sure the backend is running at ${BASE_URL}.`
  }
  const detail = err.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, '')
  return fallback
}

export const authApi = {
  async login({ email, password }) {
    return withMockFallback(
      async () => {
        const { data } = await api.post('/api/auth/login', { email, password })
        if (data.access_token) setAccessToken(data.access_token)
        return data
      },
      async () => {
        if (email === 'wrong@example.com') {
          const err = new Error('Invalid email or password')
          err.response = { data: { detail: 'Invalid email or password' } }
          throw err
        }
        setAccessToken('mock-jwt-token')
        return { access_token: 'mock-jwt-token', user: MOCK_USER }
      },
    )
  },

  async signup({ full_name, email, password }) {
    return withMockFallback(
      async () => {
        const { data } = await api.post('/api/auth/signup', {
          full_name,
          email,
          password,
        })
        if (data.access_token) setAccessToken(data.access_token)
        return data
      },
      async () => {
        setAccessToken('mock-jwt-token')
        return {
          access_token: 'mock-jwt-token',
          user: { ...MOCK_USER, full_name, email },
        }
      },
    )
  },

  async google(credential) {
    return withMockFallback(
      async () => {
        const { data } = await api.post('/api/auth/google', { credential })
        if (data.access_token) setAccessToken(data.access_token)
        return data
      },
      async () => {
        setAccessToken('mock-jwt-token')
        return { access_token: 'mock-jwt-token', user: MOCK_USER }
      },
    )
  },

  async forgotPassword(email) {
    return withMockFallback(
      async () => (await api.post('/api/auth/forgot-password', { email })).data,
      async () => ({ message: 'If an account exists for that email, a reset link has been sent.' }),
    )
  },

  async resetPassword({ token, password }) {
    return withMockFallback(
      async () => (await api.post('/api/auth/reset-password', { token, password })).data,
      async () => ({ message: 'Password updated. You can now log in.' }),
    )
  },

  /** Restore a session after a page reload using the httpOnly refresh cookie. */
  async refresh() {
    return withMockFallback(
      async () => {
        const { data } = await api.post('/api/auth/refresh')
        setAccessToken(data.access_token)
        return data
      },
      async () => {
        setAccessToken('mock-jwt-token')
        return { access_token: 'mock-jwt-token', user: MOCK_USER }
      },
    )
  },

  async logout() {
    return withMockFallback(
      async () => {
        await api.post('/api/auth/logout')
        clearAccessToken()
      },
      async () => {
        clearAccessToken()
      },
    )
  },
}

export const userApi = {
  async getProfile() {
    return withMockFallback(
      async () => {
        const { data } = await api.get('/api/user/profile')
        return data
      },
      async () => MOCK_USER,
    )
  },

  async updateProfile(payload) {
    return withMockFallback(
      async () => {
        const { data } = await api.put('/api/user/profile', payload)
        return data
      },
           async () => ({ ...MOCK_USER, ...payload }),
    )
  },

  /** Permanently deletes the account and everything in it. */
  async deleteAccount() {
    return withMockFallback(
      async () => {
        await api.delete('/api/user/me', { data: { confirm: 'DELETE' } })
      },
      async () => {
        mockScans.length = 0
      },
    )
  },
}

export const scanApi = {
  async upload(file, onUploadProgress) {
    return withMockFallback(
      async () => {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.post('/api/scan/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress,
        })
        return data
      },
      async () => {
        const previewUrl = file ? URL.createObjectURL(file) : undefined
        if (onUploadProgress) {
          onUploadProgress({ loaded: 50, total: 100 })
          await delay(400)
          onUploadProgress({ loaded: 100, total: 100 })
        }
        const nextScanNumber = Math.max(0, ...mockScans.map((scan) => scan.scan_number)) + 1
        const result = mockUploadResult(previewUrl, nextScanNumber)
        mockScans.unshift(result)
        return result
      },
    )
  },

  async getHistory({ page = 1, page_size = 5, search = '' } = {}) {
    return withMockFallback(
      async () => {
        const { data } = await api.get('/api/scan/history', {
          params: { page, page_size, search },
        })
        return data
      },
      async () => {
        let items = [...mockScans]
        const q = search.trim().toLowerCase()
        if (q) {
          items = items.filter(
            (s) =>
              s.prediction.toLowerCase().includes(q) ||
              new Date(s.created_at).toLocaleDateString().includes(q),
          )
        }
        const total = items.length
        const start = (page - 1) * page_size
        const paged = items.slice(start, start + page_size)
        return {
          items: paged,
          page,
          page_size,
          total,
          total_pages: Math.max(1, Math.ceil(total / page_size)),
        }
      },
    )
  },
    /** Permanently deletes one scan and its images. */
  async remove(id) {
    return withMockFallback(
      async () => {
        await api.delete(`/api/scan/${id}`)
      },
      async () => {
        const i = mockScans.findIndex((s) => s.id === id)
        if (i >= 0) mockScans.splice(i, 1)
      },
    )
  },
  async getById(id) {
    return withMockFallback(
      async () => {
        const { data } = await api.get(`/api/scan/${id}`)
        return data
      },
      async () => {
        const found = mockScans.find((s) => s.id === id)
        if (!found) throw new Error('Scan not found')
        return found
      },
    )
  },
}

export const reportsApi = {
  async getReport(id) {
    return withMockFallback(
      async () => {
        const { data } = await api.get(`/api/reports/${id}`)
        return data
      },
      async () => {
        const scan = mockScans.find((s) => s.id === id)
        if (!scan) throw new Error('Report not found')
        return {
          ...scan,
          patient: MOCK_USER,
          generated_at: new Date().toISOString(),
        }
      },
    )
  },
}

export const dashboardApi = {
  async getStats() {
    return withMockFallback(
      async () => {
        const { data } = await api.get('/api/dashboard/stats')
        return data
      },
      async () => mockDashboardStats(mockScans),
    )
  },
}

export const chatApi = {
  async send({ message, session_id, scan_id, lang }) {
    return withMockFallback(
      async () => {
        const { data } = await api.post('/api/chat/message', { message, session_id, scan_id, lang })
        return data
      },
      async () => mockChatReply(session_id),
    )
  },
}

export default api

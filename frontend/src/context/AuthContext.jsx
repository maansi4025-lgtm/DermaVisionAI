import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, clearAccessToken, userApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await userApi.getProfile()
      setUser(profile)
      return profile
    } catch {
      setUser(null)
      clearAccessToken()
      return null
    }
  }, [])

  // Restore the session on reload: the access token lives only in memory, so ask the server for a new
  // one using the httpOnly refresh cookie. If that fails the user is signed out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let stored = null
      try {
        stored = JSON.parse(sessionStorage.getItem('dv_user'))
      } catch {
        sessionStorage.removeItem('dv_user')
      }
      if (stored) {
        try {
          const data = await authApi.refresh()
          if (!cancelled) setUser(data.user ?? stored)
        } catch {
          sessionStorage.removeItem('dv_user')
          clearAccessToken()
        }
      }
      if (!cancelled) setInitializing(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persistUser = useCallback((nextUser) => {
    setUser(nextUser)
    if (nextUser) sessionStorage.setItem('dv_user', JSON.stringify(nextUser))
    else sessionStorage.removeItem('dv_user')
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials)
    const nextUser = data.user || (await refreshProfile())
    persistUser(nextUser)
    return data
  }, [refreshProfile, persistUser])

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authApi.google(credential)
    persistUser(data.user)
    return data
  }, [persistUser])

  const signup = useCallback(async (payload) => {
    const data = await authApi.signup(payload)
    persistUser(
      data.user || { ...payload, member_since: new Date().toISOString().slice(0, 10) },
    )
    return data
  }, [persistUser])

  const logout = useCallback(async () => {
    await authApi.logout()
    persistUser(null)
  }, [persistUser])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      login,
      loginWithGoogle,
      signup,
      logout,
      refreshProfile,
      setUser: persistUser,
    }),
    [user, initializing, login, loginWithGoogle, signup, logout, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

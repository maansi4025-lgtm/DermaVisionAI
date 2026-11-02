import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { PasswordField } from '../components/PasswordField'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage } from '../services/api'
import { validateEmail, validatePassword } from '../utils/validation'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithGoogle } = useAuth()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    }
    setErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    setLoading(true)
    try {
      await login({ email, password, remember })
      const dest = location.state?.from?.pathname || '/dashboard'
      navigate(dest, { replace: true })
    } catch (err) {
      if (err.response?.status === 401) {
        setErrors((prev) => ({ ...prev, password: 'Invalid email or password. Please try again.' }))
        showToast('Login failed. Please check your credentials.', 'error')
      } else {
        showToast(apiErrorMessage(err, 'Login failed. Please try again.'), 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async (credential) => {
    try {
      await loginWithGoogle(credential)
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (err) {
      showToast(apiErrorMessage(err, 'Google sign-in failed. Please try again.'), 'error')
    }
  }

  const googleNotConfigured = () => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') return handleGoogle('mock-credential')
    showToast('Google sign-in is not set up yet. Add VITE_GOOGLE_CLIENT_ID to frontend/.env.', 'error')
  }

  return (
    <AuthLayout
      footerLink={
        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Sign Up
          </Link>
        </p>
      }
    >
      <Card>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue to DermaVision AI</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@example.com"
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Remember me
            </label>
            <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-700">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Login
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase text-slate-400">Or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <GoogleSignInButton onCredential={handleGoogle} onNotConfigured={googleNotConfigured} />
      </Card>
    </AuthLayout>
  )
}

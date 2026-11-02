import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { PasswordField } from '../components/PasswordField'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage, authApi } from '../services/api'
import { validateConfirmPassword, validatePassword } from '../utils/validation'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const next = {
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
    }
    setErrors(next)
    if (next.password || next.confirm) return
    setLoading(true)
    try {
      await authApi.resetPassword({ token, password })
      showToast('Password updated. Please log in.', 'success')
      navigate('/login', { replace: true })
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not reset the password.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      footerLink={
        <p className="text-sm text-slate-600">
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Back to login
          </Link>
        </p>
      }
    >
      <Card>
        {!token ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Link not valid</h1>
            <p className="mt-2 text-sm text-slate-600">This reset link is missing its token.</p>
            <Link to="/forgot-password" className="mt-4 inline-block font-semibold text-indigo-600">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-slate-500">Use at least 8 characters.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <PasswordField
                label="New password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />
              <PasswordField
                label="Confirm new password"
                name="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={errors.confirm}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Update password
              </Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  )
}

import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage, authApi } from '../services/api'
import { validateEmail } from '../utils/validation'

export default function ForgotPassword() {
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const problem = validateEmail(email)
    setError(problem)
    if (problem) return
    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      showToast(apiErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      footerLink={
        <p className="text-sm text-slate-600">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Back to login
          </Link>
        </p>
      }
    >
      <Card>
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto h-10 w-10 text-indigo-600" aria-hidden />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Check your email</h1>
            <p className="mt-2 text-sm text-slate-600">
              If an account exists for <span className="font-medium">{email}</span>, we sent a link to reset
              the password. It expires in 30 minutes.
            </p>
            {import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'false' && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-900">
                Developer note: if SMTP is not set up in <code>backend/.env</code>, the link is printed in the
                backend terminal instead of being emailed.
              </p>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email and we will send you a link to choose a new one.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                placeholder="you@example.com"
              />
              <Button type="submit" className="w-full" loading={loading}>
                Send reset link
              </Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  )
}

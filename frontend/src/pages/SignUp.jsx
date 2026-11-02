import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { PasswordField } from '../components/PasswordField'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage } from '../services/api'
import {
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '../utils/validation'

export default function SignUp() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const { showToast } = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const strength = useMemo(() => passwordStrength(password), [password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = {
      fullName: !fullName.trim() ? 'Full name is required' : null,
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setLoading(true)
    try {
      await signup({ full_name: fullName.trim(), email, password })
      showToast('Account created successfully!', 'success')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      showToast(apiErrorMessage(err, 'Sign up failed. Please try again.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      footerLink={
        <p className="text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Login
          </Link>
        </p>
      }
    >
      <Card>
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Start monitoring skin health with AI assistance</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Full Name"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            autoComplete="name"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoComplete="email"
          />
          <PasswordField
            label="Password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />
          {password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= strength.score ? 'bg-indigo-500' : 'bg-slate-200'}`}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500">Strength: {strength.label}</p>
            </div>
          )}
          <PasswordField
            label="Confirm Password"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" loading={loading}>
            Sign Up
          </Button>
        </form>
      </Card>
    </AuthLayout>
  )
}

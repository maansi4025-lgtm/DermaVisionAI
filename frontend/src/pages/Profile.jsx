import { ChevronRight, KeyRound, LogOut, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { apiErrorMessage, userApi } from '../services/api'
import { formatDate } from '../utils/validation'

export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const initials = (user?.full_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await userApi.updateProfile({ full_name: name.trim() })
      setUser(updated)
      setEditing(false)
      showToast('Profile updated.', 'success')
    } catch {
      showToast('Could not update profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const closeDelete = () => {
    setDeleteOpen(false)
    setConfirmText('')
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      await userApi.deleteAccount()
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete your account. Please try again.'), 'error')
      setDeleting(false)
      return
    }
    try {
      await logout()
    } catch {
      // the account is already gone; signing out locally is all that is left
    }
    showToast('Your account and all your data were deleted.', 'success')
    navigate('/login', { replace: true })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-xl font-bold text-white">
              {initials}
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">My Profile</h2>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {editing ? 'Cancel Edit' : 'Edit Profile'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Personal Information</h3>
        <div className="mt-4 space-y-4">
          {editing ? (
            <>
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button loading={saving} onClick={handleSave}>
                Save Changes
              </Button>
            </>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Full Name</dt>
                <dd className="font-medium text-slate-900">{user?.full_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Member Since</dt>
                <dd className="font-medium text-slate-900">{formatDate(user?.member_since)}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Security</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          <li>
            <button
              type="button"
              className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-slate-800 hover:text-indigo-600"
              onClick={() => showToast('Password change will be available with backend auth.', 'info')}
            >
              <span className="inline-flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-400" aria-hidden />
                Change Password
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-red-600 hover:text-red-700"
              onClick={handleLogout}
            >
              <span className="inline-flex items-center gap-2">
                <LogOut className="h-4 w-4" aria-hidden />
                Logout
              </span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </li>
        </ul>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Privacy and data</h3>
        <p className="mt-1 text-sm text-slate-600">
          You can delete a single scan from the History page. To remove everything, delete your account.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete my account and data
        </button>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        confirmLabel="Delete everything"
        danger
        loading={deleting}
        confirmDisabled={confirmText.trim() !== 'DELETE'}
        onConfirm={handleDeleteAccount}
        onCancel={closeDelete}
      >
        <p>
          This permanently deletes your profile, all scans and photos, reports and chat history. It cannot be
          undone.
        </p>
        <Input
          label="Type DELETE to confirm"
          name="confirm-delete"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </ConfirmDialog>
    </div>
  )
}
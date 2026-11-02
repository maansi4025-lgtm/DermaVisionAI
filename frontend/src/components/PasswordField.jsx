import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Input } from './ui/Input'

export function PasswordField({ label, error, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input label={label} error={error} type={show ? 'text' : 'password'} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-[2.15rem] text-slate-400 hover:text-slate-600"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

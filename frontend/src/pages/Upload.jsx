import { AlertTriangle, Camera, CheckCircle2, ImagePlus, UploadCloud } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useToast } from '../context/ToastContext'
import { apiErrorMessage, scanApi } from '../services/api'
import { checkImageQuality } from '../utils/imageQuality'

const MAX_SIZE = 10 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png']

const tips = [
  'Use natural daylight and avoid flash glare',
  'Hold the camera 10–15 cm away and keep it steady',
  'Fill the frame with the lesion and a little surrounding skin',
  'Place a coin or ruler next to it for size reference',
  'Avoid blurry or out-of-focus photos',
  'Formats: JPG or PNG (iPhone HEIC photos must be exported as JPG)',
  'Maximum file size: 10 MB',
]

export default function UploadPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const inputRef = useRef(null)
  const cameraRef = useRef(null)
  const checkRef = useRef(0)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const validateFile = (f) => {
    if (!ACCEPT.includes(f.type)) {
      const heic = /hei[cf]/i.test(f.name) || /hei[cf]/i.test(f.type)
      showToast(
        heic
          ? 'HEIC photos are not supported. Please export the photo as JPG or PNG and try again.'
          : 'Please upload a JPG or PNG image.',
        'error',
      )
      return false
    }
    if (f.size > MAX_SIZE) {
      showToast('File exceeds 10 MB limit.', 'error')
      return false
    }
    return true
  }

  const setSelectedFile = (f) => {
    if (!validateFile(f)) return
    setFile(f)
    setWarnings([])
    const token = ++checkRef.current
    checkImageQuality(f).then((w) => {
      if (checkRef.current === token) setWarnings(w)
    })
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
  }

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files?.[0]
      if (f) setSelectedFile(f)
    },
    [showToast],
  )

  const handleSubmit = async () => {
    if (!file) {
      showToast('Please select an image first.', 'error')
      return
    }
    setSubmitting(true)
    setProgress(0)
    try {
      const result = await scanApi.upload(file, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100))
      })
      navigate(`/results/${result.id}`, { state: { result } })
    } catch (err) {
      showToast(apiErrorMessage(err, 'Upload failed, please try again.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="text-xl font-bold text-slate-900">Upload Skin Lesion Image</h2>
        <p className="mt-1 text-sm text-slate-500">
          Drag and drop your image or browse files (JPG/PNG, max 10MB).
        </p>

        {!preview ? (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50/50'
                : 'border-slate-300 bg-slate-50/80 hover:border-indigo-300'
            }`}
          >
            <UploadCloud className="h-12 w-12 text-indigo-500" aria-hidden />
            <p className="mt-4 font-semibold text-slate-800">Drop your image here</p>
            <p className="mt-1 text-sm text-slate-500">or click to browse</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <img
              src={preview}
              alt="Selected lesion preview"
              className="mx-auto max-h-72 w-full max-w-md rounded-xl object-cover ring-1 ring-slate-200"
            />
            {warnings.length > 0 && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  This photo may give a less reliable result
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-6">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">You can still submit it, but a clearer photo works better.</p>
              </div>
            )}
            <Button variant={warnings.length ? 'primary' : 'secondary'} onClick={() => inputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden />
              {warnings.length ? 'Choose another photo' : 'Change Image'}
            </Button>
          </div>
        )}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setSelectedFile(f)
            e.target.value = ''
          }}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setSelectedFile(f)
          }}
        />

        {!submitting && (
          <Button variant="secondary" className="mt-4 sm:hidden" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden />
            Take a photo
          </Button>
        )}

        {submitting && (
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm text-slate-600">
              <span>{progress < 100 ? 'Uploading image…' : 'Analyzing image, this can take a few seconds…'}</span>
              <span>{progress < 100 ? `${progress}%` : ''}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-brand-gradient transition-all duration-300"
                style={{ width: `${Math.max(progress, 8)}%` }}
              />
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500">
          Your image is saved to your account so you can see it in History and Reports. Please keep faces
          and identifying details out of the photo.
        </p>

        <Button
          className="mt-3 w-full sm:w-auto"
          loading={submitting}
          disabled={!file}
          onClick={handleSubmit}
        >
          Submit for Analysis
        </Button>
      </Card>

      <Card className="h-fit">
        <h3 className="font-semibold text-slate-900">Image Tips</h3>
        <ul className="mt-4 space-y-3">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-sm text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
              {tip}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
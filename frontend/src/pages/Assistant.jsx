import clsx from 'clsx'
import { AlertTriangle, Mic, RotateCcw, Send, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MedicalDisclaimer } from '../components/MedicalDisclaimer'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { speak, speechSupport, stopSpeaking, useSpeechRecognition } from '../hooks/useSpeech'
import { chatApi, scanApi } from '../services/api'
import { badgeLabel, isLowConfidence } from '../utils/result'
import { parseVoiceCommand } from '../utils/voiceCommands'

const LANGS = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
]

const BANNERS = {
  soon: {
    style: 'border-amber-200 bg-amber-50 text-amber-900',
    text: 'Based on what you described, it is worth getting this checked within 1 to 2 weeks.',
  },
  urgent: {
    style: 'border-red-200 bg-red-50 text-red-900',
    text: 'Based on what you described, please see a doctor within the next day or two.',
  },
  emergency: {
    style: 'border-red-300 bg-red-100 text-red-900',
    text: 'This may be an emergency. Seek urgent medical care now.',
  },
}

const MIC_ERRORS = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to use voice.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in your browser settings to use voice.',
  'no-speech': "I didn't hear anything. Tap the microphone and try again.",
  network: 'Voice recognition needs an internet connection.',
  'audio-capture': 'No microphone was found.',
}

const consentKey = (user) => `dv_chat_consent_v1:${user?.id ?? user?.email ?? 'anon'}`
const readConsent = (user) => {
  try {
    return localStorage.getItem(consentKey(user)) === 'yes'
  } catch {
    return false
  }
}

const FRESH_META = { urgency: 'routine', emergency: false, quick: [] }

export default function Assistant() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const scanId = params.get('scan')
  const firstName = (user?.full_name || '').split(' ')[0]

  const greeting = () => ({
    role: 'assistant',
    content: `Hi${firstName ? ` ${firstName}` : ''}, I'm your skin health assistant. Tell me what you've noticed on your skin and I'll ask a few questions to understand it. You can type, or tap the microphone and speak.`,
  })

  const [messages, setMessages] = useState(() => [greeting()])
  const [sessionId, setSessionId] = useState(null)
  const [meta, setMeta] = useState(FRESH_META)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [lang, setLang] = useState('en-IN')
  const [voiceReply, setVoiceReply] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [scan, setScan] = useState(null)
  const [consented, setConsented] = useState(() => readConsent(user))

  const bottomRef = useRef(null)
  const startRef = useRef(() => {})
  const live = useRef({})
  useEffect(() => {
    live.current = { handsFree, voiceReply, lang, sessionId }
  })

  useEffect(() => {
    if (!scanId) return
    scanApi.getById(scanId).then(setScan).catch(() => {})
  }, [scanId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  useEffect(() => () => stopSpeaking(), [])

  const say = (text) => {
    if (!live.current.voiceReply) return
    speak(text, {
      lang: live.current.lang,
      onEnd: () => live.current.handsFree && startRef.current(),
    })
  }

  const addAssistant = (content) => setMessages((m) => [...m, { role: 'assistant', content }])

  const resetChat = () => {
    stopSpeaking()
    setMessages([greeting()])
    setSessionId(null)
    setMeta(FRESH_META)
    setInput('')
  }

  const runCommand = async (cmd) => {
    if (cmd.type === 'stop') {
      stopSpeaking()
      setHandsFree(false)
    } else if (cmd.type === 'reset') {
      resetChat()
    } else if (cmd.type === 'navigate') {
      speak(`Opening ${cmd.label}`, { lang: 'en-IN' })
      navigate(cmd.to)
    } else if (cmd.type === 'read_last_scan') {
      let text
      try {
        const { items } = await scanApi.getHistory({ page: 1, page_size: 1 })
        const s = items[0]
        text = s
          ? isLowConfidence(s)
            ? `Your latest scan, number ${s.scan_number}, gave an uncertain result. Please have a doctor look at it. This is a screening result, not a diagnosis.`
            : `Your latest scan, number ${s.scan_number}, was classified as ${s.prediction} with ${Math.round(s.confidence * 100)} percent confidence. This is a screening result, not a diagnosis, so please confirm it with a dermatologist.`
          : 'You have no scans yet. Say "open upload" to add one.'
      } catch {
        text = 'Sorry, I could not load your latest scan.'
      }
      addAssistant(text)
      say(text)
    }
  }

  const giveConsent = () => {
    try {
      localStorage.setItem(consentKey(user), 'yes')
    } catch {
      // storage can be blocked; consent then only lasts for this visit
    }
    setConsented(true)
  }

  const send = async (raw, fromVoice = false) => {
    const content = raw.trim()
    if (!content || sending || !consented) return
    stopSpeaking()
    setInput('')

    if (fromVoice) {
      const cmd = parseVoiceCommand(content)
      if (cmd) {
        setMessages((m) => [...m, { role: 'user', content, command: true }])
        await runCommand(cmd)
        return
      }
    }

    setMessages((m) => [...m, { role: 'user', content }])
    setMeta((x) => ({ ...x, quick: [] }))
    setSending(true)
    try {
      const data = await chatApi.send({
        message: content,
        session_id: live.current.sessionId,
        scan_id: scanId || undefined,
        lang: live.current.lang.slice(0, 2),
      })
      setSessionId(data.session_id)
      addAssistant(data.reply)
      setMeta({
        urgency: data.urgency,
        emergency: data.emergency,
        quick: data.quick_replies ?? [],
      })
      say(data.reply)
    } catch {
      showToast('The assistant could not reply. Please try again.', 'error')
    } finally {
      setSending(false)
    }
  }

  const { supported, listening, interim, start, stop } = useSpeechRecognition({
    lang,
    onResult: (text) => send(text, true),
    onError: (code) => {
      setHandsFree(false)
      showToast(MIC_ERRORS[code] || 'Voice input stopped unexpectedly.', 'error')
    },
  })
  useEffect(() => {
    startRef.current = start
  }, [start])

  const toggleMic = () => {
    if (!consented) return
    if (listening) return stop()
    stopSpeaking()
    start()
  }

  const toggleHandsFree = () => {
    if (!consented) return
    const next = !handsFree
    setHandsFree(next)
    if (next) {
      setVoiceReply(true)
      toggleMic()
    } else {
      stop()
      stopSpeaking()
    }
  }

  const banner = meta.emergency ? BANNERS.emergency : BANNERS[meta.urgency]

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[440px] max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Assistant</h2>
          <p className="text-sm text-slate-500">
            {scan
              ? `Discussing scan #${scan.scan_number}: ${badgeLabel(scan)}`
              : 'Describe your skin concern by typing or speaking'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label="Language for voice"
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {speechSupport.synthesis && (
            <Button
              variant="secondary"
              className="px-3"
              aria-pressed={voiceReply}
              aria-label={voiceReply ? 'Turn off spoken replies' : 'Turn on spoken replies'}
              onClick={() => {
                if (voiceReply) {
                  stopSpeaking()
                  setHandsFree(false)
                }
                setVoiceReply((v) => !v)
              }}
            >
              {voiceReply ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="secondary" className="px-3" onClick={resetChat} aria-label="Start a new chat">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', banner.style)}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{banner.text}</p>
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col p-0 sm:p-0">
        <div role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {messages.map((m, i) => (
            <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <p
                className={clsx(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-md bg-brand-gradient text-white'
                    : 'rounded-bl-md bg-slate-100 text-slate-800',
                  m.command && 'italic opacity-80',
                )}
              >
                {m.content}
              </p>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start" aria-label="Assistant is typing">
              <span className="flex gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: `${d * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {meta.quick.length > 0 && !sending && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 pt-3 sm:px-5">
            {meta.quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {!consented && (
          <div
            role="group"
            aria-labelledby="chat-consent-title"
            className="space-y-3 border-t border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:p-5"
          >
            <h3 id="chat-consent-title" className="font-semibold text-slate-900">
              Before you chat
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Your messages, your first name and, if you opened the chat from a scan, that scan&apos;s result
                may be sent to an AI service to write the replies. This depends on how this app is set up.
              </li>
              <li>Your chat is saved in your account. You can delete your account in Profile.</li>
              <li>
                If you use the microphone, your browser may send your voice to its own speech service to turn it
                into text.
              </li>
              <li>
                Please do not type your full name, phone number, address or other identifying details. The
                assistant cannot diagnose. In an emergency call 112.
              </li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button onClick={giveConsent}>I understand, continue</Button>
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                No thanks
              </Button>
            </div>
          </div>
        )}

        {consented && (
          <form
            className="flex items-end gap-2 p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            {supported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? 'Stop listening' : 'Speak your message'}
                className={clsx(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
                  listening
                    ? 'animate-pulse bg-red-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
            <input
              value={listening && interim ? interim : input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Listening…' : 'Describe what you have noticed…'}
              maxLength={2000}
              aria-label="Message"
              className="h-11 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <Button
              type="submit"
              className="h-11 w-11 rounded-full p-0"
              disabled={!input.trim() || sending}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        {supported ? (
          <button
            type="button"
            onClick={toggleHandsFree}
            aria-pressed={handsFree}
            className={clsx(
              'rounded-full px-3 py-1 font-medium ring-1 ring-inset transition',
              handsFree
                ? 'bg-indigo-600 text-white ring-indigo-600'
                : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
            )}
          >
            Hands-free conversation {handsFree ? 'on' : 'off'}
          </button>
        ) : (
          <span>Voice input is not supported in this browser. Try Chrome or Edge.</span>
        )}
        <span>Voice commands: &quot;open history&quot;, &quot;read my last result&quot;, &quot;new chat&quot;, &quot;stop&quot;</span>
      </div>
      <MedicalDisclaimer />
    </div>
  )
}
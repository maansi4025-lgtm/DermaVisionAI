import { useCallback, useEffect, useRef, useState } from 'react'

const Recognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export const speechSupport = {
  recognition: Boolean(Recognition),
  synthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
}

/**
 * Speech-to-text using the browser's Web Speech API (best in Chrome and Edge).
 * Note: Chrome sends the audio to Google's speech service to transcribe it.
 */
export function useSpeechRecognition({ lang, onResult, onError }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)
  const cbRef = useRef({ onResult, onError })

  useEffect(() => {
    cbRef.current = { onResult, onError }
  })

  const start = useCallback(() => {
    if (!Recognition || recRef.current) return
    const rec = new Recognition()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''

    rec.onresult = (e) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else partial += r[0].transcript
      }
      setInterim(partial || finalText)
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') cbRef.current.onError?.(e.error)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      setInterim('')
      if (finalText.trim()) cbRef.current.onResult?.(finalText.trim())
    }

    recRef.current = rec
    setListening(true)
    try {
      rec.start()
    } catch {
      recRef.current = null
      setListening(false)
    }
  }, [lang])

  const stop = useCallback(() => recRef.current?.stop(), [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: speechSupport.recognition, listening, interim, start, stop }
}

let speakToken = 0

/** Text-to-speech. `onEnd` fires only when this utterance finishes, not when it is interrupted. */
export function speak(text, { lang = 'en-IN', onEnd } = {}) {
  if (!speechSupport.synthesis) {
    onEnd?.()
    return
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const token = ++speakToken
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = lang
  const voices = synth.getVoices()
  const voice =
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(lang.slice(0, 2)))
  if (voice) utter.voice = voice
  const done = () => {
    if (token === speakToken) onEnd?.()
  }
  utter.onend = done
  utter.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') done()
  }
  synth.speak(utter)
}

export function stopSpeaking() {
  speakToken++
  if (speechSupport.synthesis) window.speechSynthesis.cancel()
}

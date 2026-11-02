const PAGES = [
  { re: /\b(dashboard|home)\b/, to: '/dashboard', label: 'the dashboard' },
  { re: /\b(upload|new scan|scan page)\b/, to: '/upload', label: 'upload scan' },
  { re: /\b(history|past scans|previous scans)\b/, to: '/history', label: 'your scan history' },
  { re: /\b(reports?)\b/, to: '/reports', label: 'your reports' },
  { re: /\b(profile|account)\b/, to: '/profile', label: 'your profile' },
]

/**
 * Recognises a small set of spoken app commands. Navigation requires a leading verb ("open history")
 * so that a symptom description like "the history of this mole" is never mistaken for a command.
 * Returns null when the text should go to the assistant as a normal message.
 */
export function parseVoiceCommand(text) {
  const t = text.toLowerCase().trim().replace(/[.!?,]+$/g, '')

  if (/^(stop|be quiet|quiet|stop talking|cancel|that's enough)$/.test(t)) return { type: 'stop' }
  if (/^(start a |start |begin a )?(new chat|new conversation|start over|clear chat)$/.test(t))
    return { type: 'reset' }
  if (/^(read|tell me|what('s| is| was)|say)\b.*\b(last|latest|recent)\b.*\b(result|scan)\b/.test(t))
    return { type: 'read_last_scan' }

  const nav = t.match(/^(open|go to|show( me)?|take me to|navigate to)\s+(the |my )?(.+)$/)
  if (nav) {
    const page = PAGES.find((p) => p.re.test(nav[4]))
    if (page) return { type: 'navigate', to: page.to, label: page.label }
  }
  return null
}

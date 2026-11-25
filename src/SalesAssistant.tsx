import { useEffect, useRef, useState } from 'react'
import type { Menu } from './menu'
import { answerSalesQuestion, missingGeminiKey } from './geminiSales'

type Turn = { question: string; answer?: string }

export function SalesAssistant({ menu }: { menu: Menu }) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const conversation = useRef<HTMLDivElement>(null)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const log = conversation.current
    if (log) log.scrollTop = log.scrollHeight
  }, [turns])

  async function ask() {
    const text = question.trim()
    if (!text || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setQuestion('')
    setTurns((previous) => [...previous, { question: text }])

    try {
      const answer = await answerSalesQuestion(text, menu, apiKey, controller.signal)
      if (!controller.signal.aborted) {
        setTurns((previous) => previous.map((turn, index) =>
          index === previous.length - 1 ? { ...turn, answer } : turn,
        ))
      }
    } catch (problem) {
      if (!controller.signal.aborted) {
        setQuestion(text)
        setError(problem instanceof Error ? problem.message : 'Could not answer the sales question.')
      }
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="summary-panel sales-assistant" aria-labelledby="sales-assistant-heading">
      <h2 id="sales-assistant-heading">Sales assistant</h2>
      {!apiKey && <p>{missingGeminiKey}</p>}
      {turns.length > 0 && (
        <div ref={conversation} className="sales-conversation" role="log" aria-label="Sales conversation">
          {turns.map((turn, index) => (
            <div key={index}>
              <p><strong>You</strong> {turn.question}</p>
              {turn.answer && <p><strong>Assistant</strong> {turn.answer}</p>}
            </div>
          ))}
        </div>
      )}
      {busy && <p role="status">Checking the sales records…</p>}
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => {
        event.preventDefault()
        void ask()
      }}>
        <label htmlFor="sales-question">Sales question</label>
        <div className="sales-input">
          <input
            id="sales-question"
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder="How many orders have we had?"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !question.trim()}>Ask</button>
        </div>
      </form>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Menu } from './menu'
import { answerSalesQuestion, missingGeminiKey } from './geminiSales'
import './SalesAssistant.css'

type Turn = { question: string; answer?: string }

const starterQuestions = ['How many orders?', 'What is the best-selling option?', 'What is the total revenue?']
const compactViewport = '(max-width: 759px)'

export function SalesAssistant({ menu }: { menu: Menu }) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const conversation = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const log = conversation.current
    if (log) log.scrollTop = log.scrollHeight
  }, [open, turns, busy, error])
  useEffect(() => {
    const media = window.matchMedia?.(compactViewport)
    const closeOnLayoutChange = () => {
      if (dialog.current?.open) dialog.current.close()
    }
    media?.addEventListener('change', closeOnLayoutChange)
    return () => media?.removeEventListener('change', closeOnLayoutChange)
  }, [])

  function toggleAssistant() {
    const panel = dialog.current
    if (!panel) return
    if (panel.open) {
      panel.close()
      return
    }
    if (window.matchMedia?.(compactViewport).matches) panel.showModal()
    else panel.show()
    setOpen(true)
  }

  async function ask(input: string) {
    const text = input.trim()
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
        setTurns((previous) => previous.slice(0, -1))
        setQuestion(text)
        setError(problem instanceof Error ? problem.message : 'Could not answer the sales question.')
      }
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <>
      <button
        className="assistant-launcher button-primary"
        type="button"
        aria-label="Sales assistant"
        aria-haspopup="dialog"
        aria-controls="sales-assistant-panel"
        aria-expanded={open}
        onClick={toggleAssistant}
      >
        <span className="chat-icon" aria-hidden="true" />
        <span className="assistant-launcher-label">Sales assistant</span>
      </button>
      <dialog
        ref={dialog}
        id="sales-assistant-panel"
        className="sales-dialog"
        aria-labelledby="sales-assistant-heading"
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.currentTarget.matches(':modal')) event.currentTarget.close()
        }}
      >
        <section className="sales-assistant" aria-labelledby="sales-assistant-heading">
          <header className="sales-header">
            <span className="sales-header-icon" aria-hidden="true"><span className="chat-icon" /></span>
            <h2 id="sales-assistant-heading">Sales assistant</h2>
            <button
              type="button" className="close-button" aria-label="Close sales assistant"
              onClick={() => dialog.current?.close()}
            >×</button>
          </header>
          <div ref={conversation} className="sales-body" tabIndex={0}>
            {!apiKey && <p className="assistant-setup">{missingGeminiKey}</p>}
            {turns.length === 0 && (
              <div className="sales-welcome">
                <p>I can help you find answers in your completed orders.</p>
                <ul className="starter-questions" aria-label="Suggested questions">
                  {starterQuestions.map((prompt) => (
                    <li key={prompt}>
                      <button type="button" onClick={() => {
                        conversation.current?.focus()
                        void ask(prompt)
                      }}>
                        {prompt}<span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="sales-conversation" role="log" aria-label="Sales conversation">
              {turns.map((turn, index) => (
                <div key={index} className="chat-turn">
                  <p className="chat-question"><strong>You</strong> {turn.question}</p>
                  {turn.answer && <p className="chat-answer"><strong>Assistant</strong> {turn.answer}</p>}
                </div>
              ))}
            </div>
            {busy && <p className="sales-status" role="status">Checking the sales records…</p>}
            {error && <p role="alert">{error}</p>}
          </div>
          <form className="sales-form" onSubmit={(event) => {
            event.preventDefault()
            void ask(question)
          }}>
            <label className="visually-hidden" htmlFor="sales-question">Sales question</label>
            <input
              id="sales-question"
              value={question}
              onChange={(event) => setQuestion(event.currentTarget.value)}
              placeholder="Ask about your sales"
              enterKeyHint="send"
              readOnly={busy}
            />
            <button className="button-primary" type="submit" disabled={busy || !question.trim()}>Ask <span aria-hidden="true">↑</span></button>
          </form>
        </section>
      </dialog>
    </>
  )
}

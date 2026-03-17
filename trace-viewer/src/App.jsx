import { useState, useEffect, useRef } from 'react'
import './App.css'

function renderMarkdown(text) {
  let html = text
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/`(.+?)`/g, '<code>$1</code>')
  html = html.replace(/\$([^$]+)\$/g, '<code class="latex">$1</code>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return html
}

function Rendering({ rendering }) {
  const { type, data, style, external_link, internal_link } = rendering

  if (type === 'markdown') {
    const isHeading = /^#{1,6}\s/.test(data)
    const isList = /^- /.test(data)
    if (isHeading) {
      return <div className="md-block" dangerouslySetInnerHTML={{ __html: renderMarkdown(data) }} />
    }
    if (isList) {
      const itemHtml = renderMarkdown(data.replace(/^- /, ''))
      return <li className="md-list-item" dangerouslySetInnerHTML={{ __html: itemHtml }} />
    }
    return <span className="md-inline" dangerouslySetInnerHTML={{ __html: renderMarkdown(data) }} />
  }

  if (type === 'image') {
    const src = data.startsWith('http') ? data : `/${data}`
    return (
      <div className="image-block">
        <img src={src} style={style?.width ? { maxWidth: style.width } : {}} alt="" loading="lazy" />
      </div>
    )
  }

  if (type === 'link') {
    if (external_link) {
      const title = external_link.title || external_link.url
      let tooltip = ''
      if (external_link.authors) {
        tooltip = external_link.authors.slice(0, 3).join(', ')
        if (external_link.authors.length > 3) tooltip += ' et al.'
      }
      return (
        <a className="ext-link" href={external_link.url} target="_blank" rel="noopener noreferrer" title={tooltip}>
          {title.trim()}
        </a>
      )
    }
    if (internal_link) {
      return <a className="int-link" href={`#line-${internal_link.line_number}`}>{data || 'link'}</a>
    }
  }

  return null
}

function StepGroup({ group }) {
  const { renderings } = group
  const first = renderings[0]
  const isHeading = first.type === 'markdown' && /^#{1,6}\s/.test(first.data)
  const isImage = first.type === 'image'
  const isList = first.type === 'markdown' && /^- /.test(first.data)

  if (isImage) {
    return <Rendering rendering={first} />
  }

  return (
    <div className={`step-group${isHeading ? ' heading' : ''}${isList ? ' list-item' : ''}`}>
      {renderings.map((r, i) => <Rendering key={i} rendering={r} />)}
    </div>
  )
}

function EnvDisplay({ env }) {
  const entries = Object.entries(env)
  if (entries.length === 0) return null

  return (
    <div className="env-display">
      {entries.map(([key, value]) => {
        let display = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        if (display.length > 200) display = display.slice(0, 200) + '...'
        return (
          <div key={key} className="env-entry">
            <span className="env-key">{key}</span>
            <span className="env-eq">=</span>
            <span className="env-val">{display}</span>
          </div>
        )
      })}
    </div>
  )
}

function SourceCode({ code, highlightLine, clickableLines, onLineClick }) {
  const lines = code.split('\n')
  const codeRef = useRef(null)

  useEffect(() => {
    if (highlightLine && codeRef.current) {
      const el = codeRef.current.querySelector('.hl')
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightLine])

  return (
    <pre className="source-code" ref={codeRef}>
      {lines.map((line, i) => {
        const lineNum = i + 1
        const isClickable = clickableLines?.has(lineNum)
        return (
          <div key={i} className={`code-line${lineNum === highlightLine ? ' hl' : ''}`}>
            <span
              className={`line-num${isClickable ? ' clickable' : ''}`}
              onClick={isClickable ? () => onLineClick(lineNum) : undefined}
            >
              {lineNum}
            </span>
            <span className="line-text">{line}</span>
          </div>
        )
      })}
    </pre>
  )
}

function App() {
  const [trace, setTrace] = useState(null)
  const [error, setError] = useState(null)
  const [showCode, setShowCode] = useState(false)
  const [showVars, setShowVars] = useState(true)
  const [stepMode, setStepMode] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const lastGroupRef = useRef(null)
  const contentRef = useRef(null)
  const prevStepRef = useRef(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tracePath = params.get('trace')
    if (!tracePath) {
      setError('No trace specified. Use ?trace=var/traces/lecture_01.json')
      return
    }
    fetch(`/${tracePath}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load: ${r.status}`)
        return r.json()
      })
      .then(setTrace)
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (!stepMode) return
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentStep(s => Math.min(s + 1, (trace?.steps?.length || 1) - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentStep(s => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stepMode, trace])

  useEffect(() => {
    if (!stepMode || !lastGroupRef.current || !contentRef.current) return
    requestAnimationFrame(() => {
      const el = lastGroupRef.current
      const container = contentRef.current
      if (!el || !container) return
      const elRect = el.getBoundingClientRect()
      // Step bar is fixed at the bottom, ~50px tall + 1000px breathing room
      const visibleBottom = window.innerHeight - 1050
      // Only scroll if the last element's bottom is below the visible area
      if (elRect.bottom > visibleBottom) {
        container.scrollTop += elRect.bottom - visibleBottom
      }
    })
  }, [stepMode, currentStep])

  if (error) return <div className="error-msg">{error}</div>
  if (!trace) return <div className="loading">Loading trace...</div>

  // Build rendering groups from steps
  const groups = []
  const stepsToShow = stepMode ? trace.steps.slice(0, currentStep + 1) : trace.steps
  for (const step of stepsToShow) {
    if (step.renderings.length > 0) {
      groups.push({ renderings: step.renderings, env: step.env, stack: step.stack })
    } else if (showVars && step.env && Object.keys(step.env).length > 0) {
      groups.push({ renderings: [], env: step.env, stack: step.stack })
    }
  }

  // Build line number -> first step index map
  const lineToStep = {}
  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i]
    const topFrame = step.stack[step.stack.length - 1]
    if (topFrame) {
      const ln = topFrame.line_number
      if (!(ln in lineToStep)) lineToStep[ln] = i
    }
  }
  const clickableLines = new Set(Object.keys(lineToStep).map(Number))

  const handleLineClick = (lineNum) => {
    const stepIdx = lineToStep[lineNum]
    if (stepIdx !== undefined) {
      setStepMode(true)
      setShowCode(true)
      setCurrentStep(stepIdx)
    }
  }

  const activeStep = stepMode ? trace.steps[currentStep] : null
  const activeLine = activeStep?.stack?.[activeStep.stack.length - 1]?.line_number
  const fileName = Object.keys(trace.files)[0] || 'trace'

  return (
    <div className="viewer">
      <header className="toolbar">
        <span className="title">{fileName}</span>
        <div className="toolbar-controls">
          <label className="toggle">
            <input type="checkbox" checked={showVars} onChange={() => setShowVars(!showVars)} />
            Variables
          </label>
          <label className="toggle">
            <input type="checkbox" checked={stepMode} onChange={() => setStepMode(!stepMode)} />
            Step Mode
          </label>
          <button className="toolbar-btn" onClick={() => setShowCode(!showCode)}>
            {showCode ? 'Hide Source' : 'Show Source'}
          </button>
        </div>
      </header>

      <div className={`main-layout${showCode ? ' with-code' : ''}`}>
        <div className={`lecture-content${stepMode ? ' has-step-bar' : ''}`} ref={contentRef}>
          {groups.map((group, i) => (
            <div key={i} ref={i === groups.length - 1 ? lastGroupRef : null}>
              {group.renderings.length > 0 && <StepGroup group={group} />}
              {showVars && group.env && Object.keys(group.env).length > 0 && (
                <EnvDisplay env={group.env} />
              )}
            </div>
          ))}
        </div>

        {showCode && (
          <aside className={`source-panel${stepMode ? ' has-step-bar' : ''}`}>
            <SourceCode code={trace.files[fileName]} highlightLine={activeLine} clickableLines={clickableLines} onLineClick={handleLineClick} />
          </aside>
        )}
      </div>

      {stepMode && (
        <div className="step-controls">
          <button onClick={() => setCurrentStep(s => Math.max(s - 1, 0))} disabled={currentStep === 0}>Prev</button>
          <span className="step-info">
            Step{' '}
            <input
              className="step-input"
              type="number"
              min={1}
              max={trace.steps.length}
              value={currentStep + 1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) setCurrentStep(Math.max(0, Math.min(val - 1, trace.steps.length - 1)))
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            {' '}/ {trace.steps.length}
            {activeStep && ` — ${activeStep.stack[activeStep.stack.length - 1]?.function_name}() line ${activeLine}`}
          </span>
          <button onClick={() => setCurrentStep(s => Math.min(s + 1, trace.steps.length - 1))} disabled={currentStep === trace.steps.length - 1}>Next</button>
        </div>
      )}
    </div>
  )
}

export default App

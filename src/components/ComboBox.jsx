import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function ComboBox({ options, value, onChange, placeholder = 'Select...', className = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const selected = options.find(o => o.value === value)

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    setHighlightIdx(i => Math.min(i, filtered.length - 1))
  }, [filtered.length])

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(opt) {
    onChange(opt.value)
    setOpen(false)
    setSearch('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      if (filtered.length === 1) {
        handleSelect(filtered[0])
      } else if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        handleSelect(filtered[highlightIdx])
      }
    }
  }

  return (
    <div className="combobox" ref={containerRef}>
      <div className="combobox-trigger">
        <input
          ref={inputRef}
          className={`input combobox-input ${className}`}
          value={open ? search : (selected?.label || value || '')}
          placeholder={placeholder}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown size={16} className="combobox-chevron" />
      </div>
      {open && (
        <div className="combobox-dropdown">
          {filtered.length === 0 && (
            <div className="combobox-empty">No results</div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.value}
              className={`combobox-option ${opt.value === value ? 'selected' : ''} ${i === highlightIdx ? 'highlight' : ''}`}
              onMouseDown={() => handleSelect(opt)}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

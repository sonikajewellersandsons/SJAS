import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

// freeText: allow the typed text itself to become the value (default true).
// Pass freeText={false} for searchable-but-not-editable fields (e.g. the adj-bill
// voucher picker): typing only filters, typed text is never committed, and the
// selected label is shown only as display — never pushed back into the box as
// editable text (which is what happened when focusing re-loaded the label).
export default function ComboBox({ options, value, onChange, placeholder = 'Select...', className = '', freeText = true }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // Only treat a NON-empty value as "selected". An option with an empty value
  // (e.g. a "— None —" reset row) must never be considered selected — otherwise
  // focusing pre-fills the search with its label and filters the list to itself.
  const selected = value ? options.find(o => o.value === value) : undefined

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    setHighlightIdx(i => {
      if (filtered.length === 0) return 0
      return Math.min(i, filtered.length - 1)
    })
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
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange('')
    setSearch('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length === 0) return
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length === 0) return
      setHighlightIdx(i => i <= 0 ? filtered.length - 1 : i - 1)
    }
    if (e.key === 'Enter') {
      if (filtered.length === 1) {
        handleSelect(filtered[0])
      } else if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        handleSelect(filtered[highlightIdx])
      } else {
        if (freeText) onChange(search)
        setOpen(false)
        setSearch('')
      }
    }
  }

  function handleFocus() {
    // Searchable-only mode: keep the field empty so the user can type to
    // filter immediately. The selected label lives in the closed box only.
    if (!freeText) setSearch('')
    else if (selected) setSearch(selected.label)
    setOpen(true)
  }

  function handleInputChange(e) {
    setSearch(e.target.value)
    if (!open) setOpen(true)
  }

  return (
    <div className="combobox" ref={containerRef}>
      <div className="combobox-trigger">
        <input
          ref={inputRef}
          className={`input combobox-input ${className}`}
          value={open ? search : (selected?.label || value || '')}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {selected && (
          <button type="button" className="combobox-clear" onClick={handleClear} tabIndex={-1}>
            <X size={14} />
          </button>
        )}
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

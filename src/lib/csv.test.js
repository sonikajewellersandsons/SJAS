import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    const csv = toCsv(['a', 'b'], [[1, 2], [3, 4]])
    expect(csv).toBe('a,b\r\n1,2\r\n3,4')
  })

  it('quotes fields containing commas', () => {
    const csv = toCsv(['name'], [['Sonika, Jewellers']])
    expect(csv).toContain('"Sonika, Jewellers"')
  })

  it('escapes double quotes inside quoted fields', () => {
    const csv = toCsv(['note'], [['say "hi"']])
    expect(csv).toContain('"say ""hi"""')
  })

  it('quotes fields containing newlines and lone CRs', () => {
    const csv = toCsv(['addr'], [['Line1\nLine2']])
    expect(csv).toContain('"Line1\nLine2"')
    const cr = toCsv(['addr'], [['Line1\rLine2']])
    expect(cr).toContain('"Line1\rLine2"')
  })

  it('renders empty/null values as empty strings', () => {
    const csv = toCsv(['a', 'b'], [[null, 'x']])
    expect(csv).toContain(',x')
  })

  it('defends against CSV formula injection', () => {
    const csv = toCsv(['value'], [
      ['=SUM(A1:A2)'],
      ['-1+1'],
      ['+1'],
      ['@cmd'],
      ['Rohit'],
    ])
    const lines = csv.split('\r\n').slice(1)
    expect(lines[0]).toBe("'=SUM(A1:A2)")
    expect(lines[1]).toBe("'-1+1")
    expect(lines[2]).toBe("'+1")
    expect(lines[3]).toBe("'@cmd")
    expect(lines[4]).toBe('Rohit')
  })
})

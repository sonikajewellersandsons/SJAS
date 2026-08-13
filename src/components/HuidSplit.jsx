import { BadgeCheck, BadgeX } from 'lucide-react'

function fmtW(n) {
  return (Number(n) || 0).toFixed(3)
}

export default function HuidSplit({ yesLabel, noLabel, yesWeight, yesPcs, noWeight, noPcs }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '0.75rem' }}>
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'var(--green-bg)' }}>
          <BadgeCheck size={18} color="var(--green)" />
        </div>
        <div className="stat-label">{yesLabel}</div>
        <div className="stat-value" style={{ fontSize: '1.2rem' }}>
          {fmtW(yesWeight)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>g</span>
        </div>
        <div className="text-xs text-muted">{yesPcs} pcs</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'var(--orange-bg)' }}>
          <BadgeX size={18} color="var(--orange)" />
        </div>
        <div className="stat-label">{noLabel}</div>
        <div className="stat-value" style={{ fontSize: '1.2rem' }}>
          {fmtW(noWeight)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>g</span>
        </div>
        <div className="text-xs text-muted">{noPcs} pcs</div>
      </div>
    </div>
  )
}

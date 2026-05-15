// src/components/MindMapPanel.jsx
import { useState, useRef } from 'react'

const PRESETS = {
  hematology: {
    center: 'Hematology',
    branches: [
      { label: 'Red Cell Disorders', color: '#E24B4A', children: ['Thalassemia','Anemia of CKD','Sickle Cell','Hemolysis'] },
      { label: 'White Cell Disorders', color: '#7F77DD', children: ['AML','CML','ALL','Lymphoma'] },
      { label: 'Hemostasis', color: '#378ADD', children: ['VTE','DIC','ITP','HIT'] },
      { label: 'Lab Tests', color: '#1D9E75', children: ['CBC','PB Film','BM Biopsy','Flow Cytometry'] },
      { label: 'Treatment', color: '#EF9F27', children: ['Transfusion','Chemo','TKI Therapy','BMT'] },
    ]
  },
  stroke: {
    center: 'Stroke Fast Track',
    branches: [
      { label: 'Assessment', color: '#378ADD', children: ['NIHSS Score','ASPECT CT','Time Window','Contraindications'] },
      { label: 'Treatment', color: '#E24B4A', children: ['rt-PA IV','Thrombectomy','Refer Pathway','Non-Fast Track'] },
      { label: 'Monitoring', color: '#1D9E75', children: ['BP Control','Neuro Obs','Glucose','LINE Alert'] },
      { label: 'Documentation', color: '#EF9F27', children: ['Refer PDF','Time Log','Family Consent','Discharge Plan'] },
    ]
  }
}

function getPreset(topic) {
  const t = topic.toLowerCase()
  if (t.includes('hema') || t.includes('blood')) return PRESETS.hematology
  if (t.includes('stroke') || t.includes('cva')) return PRESETS.stroke
  return {
    center: topic,
    branches: [
      { label: 'Overview', color: '#1D9E75', children: ['Definition','Key Concepts','Examples','Notes'] },
      { label: 'Details', color: '#7F77DD', children: ['Point A','Point B','Point C','Point D'] },
      { label: 'Action Items', color: '#EF9F27', children: ['Task 1','Task 2','Task 3'] },
      { label: 'Resources', color: '#378ADD', children: ['Books','Articles','Links'] },
    ]
  }
}

export default function MindMapPanel() {
  const [topic, setTopic] = useState('')
  const [map, setMap] = useState(PRESETS.hematology)

  function generate() {
    if (!topic.trim()) return
    setMap(getPreset(topic.trim()))
  }

  const W = 680, H = 490, cx = W / 2, cy = H / 2

  function renderMap() {
    if (!map) return null
    const branches = map.branches
    const n = branches.length
    const elements = []

    branches.forEach((b, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      const bx = cx + Math.cos(angle) * 135
      const by = cy + Math.sin(angle) * 105

      // Spoke line
      elements.push(
        <line key={`line-${i}`} x1={cx} y1={cy} x2={bx} y2={by}
          stroke={b.color} strokeWidth="2" strokeOpacity="0.35" />
      )

      // Children
      ;(b.children || []).forEach((child, j) => {
        const spread = 42
        const offset = (j - (b.children.length - 1) / 2) * spread
        const perp = angle + Math.PI / 2
        const lx = bx + Math.cos(angle) * 95 + Math.cos(perp) * offset
        const ly = by + Math.sin(angle) * 95 + Math.sin(perp) * offset
        const tw = child.length * 5 + 18

        elements.push(
          <line key={`cl-${i}-${j}`} x1={bx} y1={by} x2={lx} y2={ly}
            stroke={b.color} strokeWidth="1" strokeOpacity="0.22" strokeDasharray="3,3" />,
          <g key={`cn-${i}-${j}`}>
            <rect x={lx - tw / 2} y={ly - 10} width={tw} height={20} rx={10}
              fill={b.color + '1A'} stroke={b.color} strokeWidth="0.5" />
            <text x={lx} y={ly + 4} textAnchor="middle" fontSize="10"
              fill={b.color} fontFamily="'DM Sans', sans-serif">{child}</text>
          </g>
        )
      })

      // Branch node
      const bw = b.label.length * 7 + 22
      elements.push(
        <g key={`bn-${i}`} style={{ cursor: 'pointer' }}>
          <rect x={bx - bw / 2} y={by - 15} width={bw} height={30} rx={8} fill={b.color} />
          <text x={bx} y={by + 5} textAnchor="middle" fontSize="11.5" fontWeight="500"
            fill="white" fontFamily="'DM Sans', sans-serif">{b.label}</text>
        </g>
      )
    })

    // Center circle
    const words = (map.center || '').split(' ')
    elements.push(
      <g key="center">
        <circle cx={cx} cy={cy} r={48} fill="#1D9E75" />
        {words.length <= 2
          ? <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="500"
              fill="white" fontFamily="'DM Sans', sans-serif">{map.center}</text>
          : <>
              <text x={cx} y={cy - 3} textAnchor="middle" fontSize="12" fontWeight="500"
                fill="white" fontFamily="'DM Sans', sans-serif">{words.slice(0, 2).join(' ')}</text>
              <text x={cx} y={cy + 13} textAnchor="middle" fontSize="12" fontWeight="500"
                fill="white" fontFamily="'DM Sans', sans-serif">{words.slice(2).join(' ')}</text>
            </>
        }
      </g>
    )

    return elements
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)',
        display: 'flex', gap: '8px', alignItems: 'center'
      }}>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="Topic (e.g. Hematology, Stroke, CML…)"
          style={{
            flex: 1, maxWidth: '280px', padding: '6px 10px',
            border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px',
            fontSize: '12px', fontFamily: 'inherit', background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)', outline: 'none'
          }}
        />
        <button onClick={generate} style={{
          padding: '6px 14px', background: '#1D9E75', color: 'white', border: 'none',
          borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px'
        }}>
          <i className="ti ti-git-fork" /> Generate
        </button>
        <button onClick={() => setMap(null)} style={{
          padding: '6px 10px', background: 'transparent', border: '0.5px solid var(--color-border-secondary)',
          borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-secondary)',
          fontFamily: 'inherit'
        }}>
          <i className="ti ti-trash" />
        </button>
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          Try: Hematology · Stroke · or any topic
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ flex: 1, width: '100%' }}
        xmlns="http://www.w3.org/2000/svg">
        {map ? renderMap() : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14"
            fill="#888" fontFamily="'DM Sans', sans-serif">
            Enter a topic above and click Generate
          </text>
        )}
      </svg>
    </div>
  )
}

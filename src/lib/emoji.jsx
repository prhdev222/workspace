export const QUICK_EMOJIS = [
  '💡',
  '📌',
  '✅',
  '🩺',
  '💊',
  '🧪',
  '🩸',
  '🧠',
  '🔎',
  '⚡',
  '📄',
  '📅',
  '🚨',
  '🎯',
  '✨'
]

export function EmojiChips({ emojis = QUICK_EMOJIS, onPick, compact = false }) {
  return (
    <div style={{ display: 'flex', gap: compact ? '5px' : '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {emojis.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick?.(emoji)}
          title={`Insert ${emoji}`}
          aria-label={`Insert ${emoji}`}
          style={{
            width: compact ? '27px' : '30px',
            height: compact ? '27px' : '30px',
            borderRadius: '8px',
            border: '0.5px solid var(--color-border-secondary)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontSize: compact ? '14px' : '15px',
            lineHeight: 1,
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

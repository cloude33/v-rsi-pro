export default function FilterBar({ currentFilter, onFilter }) {
  const filters = [
    { key: 'all', label: 'Tümü' },
    { key: 'LONG', label: 'LONG', className: 'long' },
    { key: 'SHORT', label: 'SHORT', className: 'short' },
    { key: 'NÖTR', label: 'NÖTR', className: 'neutral' },
    { key: 'FAV', label: 'FAVORİLER', className: 'fav' }
  ]

  return (
    <div className="filter-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '15px 0' }}>
      {filters.map(f => (
        <button
          key={f.key}
          className={`filter-btn ${f.className || ''} ${currentFilter === f.key ? 'active' : ''}`}
          onClick={() => onFilter(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
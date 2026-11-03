import type { TournamentFilter } from '../types/homepage'

const filters: TournamentFilter[] = ['All', 'Registration Open', 'Upcoming', 'Completed']

interface TournamentFiltersProps {
  activeFilter: TournamentFilter
  onChange: (filter: TournamentFilter) => void
}

function TournamentFilters({ activeFilter, onChange }: TournamentFiltersProps) {
  return (
    <div className="tournament-filters" role="group" aria-label="Filter tournaments by status">
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          className={`filter-button${activeFilter === filter ? ' is-active' : ''}`}
          aria-pressed={activeFilter === filter}
          onClick={() => onChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  )
}

export default TournamentFilters
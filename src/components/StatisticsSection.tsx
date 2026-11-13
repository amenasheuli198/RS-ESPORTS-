import { Activity, Crosshair, Shield, Swords } from 'lucide-react'
import { demoStatistics } from '../data/homepage'

const icons = [Swords, Shield, Crosshair, Activity]

function StatisticsSection() {
  if (demoStatistics.length === 0) {
    return (
      <section className="stats-strip" id="platform-pulse" aria-label="Platform status">
        <div className="stats-strip__inner page-width">
          <p className="demo-label"><span /> Platform ready</p>
          <div className="stats-grid">
            <article className="stat-item">
              <Shield className="stat-item__icon" aria-hidden="true" size={20} strokeWidth={1.6} />
              <div>
                <p className="stat-item__value">Live<span>+</span></p>
                <p className="stat-item__label">Event publishing is ready once data is connected.</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="stats-strip" id="platform-pulse" aria-label="Platform statistics">
      <div className="stats-strip__inner page-width">
        <p className="demo-label"><span /> Platform metrics</p>
        <div className="stats-grid">
          {demoStatistics.map((statistic, index) => {
            const Icon = icons[index] ?? Activity
            return (
              <article className="stat-item" key={statistic.label}>
                <Icon className="stat-item__icon" aria-hidden="true" size={20} strokeWidth={1.6} />
                <div>
                  <p className="stat-item__value">{statistic.value}<span>+</span></p>
                  <p className="stat-item__label">{statistic.label}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default StatisticsSection
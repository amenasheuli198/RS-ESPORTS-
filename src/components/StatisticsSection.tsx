import { Activity, Crosshair, Shield, Swords } from 'lucide-react'
import { demoStatistics } from '../data/homepage'

const icons = [Swords, Shield, Crosshair, Activity]

function StatisticsSection() {
  if (demoStatistics.length === 0) {
    return (
      <section className="stats-strip" id="platform-pulse" aria-label="Platform status" data-home-reveal>
        <div className="stats-strip__inner page-width">
          <p className="demo-label"><span /> Play. Compete. Belong.</p>
          <div className="stats-grid">
            <article className="stat-item">
              <Shield className="stat-item__icon" aria-hidden="true" size={20} strokeWidth={1.6} />
              <div>
                <p className="stat-item__value">Ready</p>
                <p className="stat-item__label">Verified events appear here after publication.</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="stats-strip" id="platform-pulse" aria-label="Platform statistics" data-home-reveal>
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
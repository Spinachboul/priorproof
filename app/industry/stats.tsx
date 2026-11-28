import { annual, claimModes, type Stat } from '../public-content';
import { AnimatedFigure } from '../public-motion';

export function StatGrid({ stats }: { stats: readonly Stat[] }) {
    return <div className="stat-grid">{stats.map(({ value, description, period, source, kind, note }) => <article className="public-panel stat-card" key={description}>
        <div className="stat-period">{period} · {kind}</div>
        <strong className="stat-value"><AnimatedFigure value={value} /></strong>
        <p>{description}</p>
        {note && <p className="stat-note">{note}</p>}
        <a href={source.url}>{source.name}</a>
    </article>)}</div>;
}

export function ClaimModeChart() {
    return <figure className="public-panel claim-chart">
        <figcaption><h3>How health claims were settled</h3><p>Share by number of settled claims · FY 2024–25 · Reported</p></figcaption>
        <div className="claim-bar" aria-hidden="true">{claimModes.map(({ name, value, color }) =>
            <span key={name} title={`${name} ${value}%`} style={{ width: `${value}%`, background: color }} />)}</div>
        <dl className="claim-legend">{claimModes.map(({ name, value, color }) => <div key={name}>
            <dt><span style={{ background: color }} aria-hidden="true" />{name}</dt><dd>{value}%</dd>
        </div>)}</dl>
        <a href={annual.url}>{annual.name} · Table I.28</a>
    </figure>;
}

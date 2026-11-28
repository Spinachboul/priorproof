'use client';

import { useState } from 'react';
import { annualRecurringRevenue, calculateFeasibility, calculateRoi, feasibilityDefaults, parseAmount, roiDefaults } from './calculations';

const numbers = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const formatHours = (amount: number) => `${numbers.format(amount)} h`;

type RoiField = keyof typeof roiDefaults;
const fields: readonly { name: RoiField; label: string; integer?: boolean; max?: number; optional?: boolean }[] = [
    { name: 'dailyCases', label: 'Pre-authorization cases per day', integer: true },
    { name: 'operatingDays', label: 'Operating days per month', integer: true, max: 31 },
    { name: 'manualMinutes', label: 'Manual minutes per case' },
    { name: 'assistedMinutes', label: 'Assisted minutes per case, including human review' },
    { name: 'hourlyCost', label: 'Staff cost per hour (₹)' },
    { name: 'monthlyFee', label: 'Hypothetical monthly subscription (₹)' },
    { name: 'annualCosts', label: 'Annual deployment and maintenance (₹, optional)', optional: true },
];

type CalculatorInputProps = {
    name: string;
    label: string;
    raw: string;
    onChange: (value: string) => void;
    evaluated: number | null;
    integer?: boolean;
    max?: number;
    optional?: boolean;
};

function CalculatorInput({ name, label, raw, onChange, evaluated, integer, max, optional }: CalculatorInputProps) {
    const error = max === 31 ? 'Enter a whole number from 0 to 31.' : max === 100 ? 'Enter a percentage from 0 to 100.' : integer ? 'Enter a whole number of 0 or more.' : 'Enter a finite amount of 0 or more.';
    return <div className="calculator-field">
        <label htmlFor={name}>{label}</label>
        <input id={name} inputMode={integer ? 'numeric' : 'decimal'} value={raw}
            required={!optional} aria-invalid={evaluated === null || undefined} aria-describedby={evaluated === null ? `${name}-error` : undefined}
            onChange={event => onChange(event.currentTarget.value)} />
        {evaluated === null && <span id={`${name}-error`} className="calculator-error">{error}</span>}
    </div>;
}

function EffortChart({ manual, assisted }: { manual: number; assisted: number }) {
    const max = Math.max(manual, assisted);
    return <figure className="effort-chart">
        <figcaption>Estimated monthly preparation effort</figcaption>
        {([['Manual', manual], ['AI-assisted', assisted]] as const).map(([label, hours]) =>
            <div className="effort-row" key={label}><span>{label}</span><strong>{formatHours(hours)}</strong>
                <div className="effort-track" aria-hidden="true"><span style={{ width: `${max === 0 ? 0 : hours / max * 100}%` }} /></div>
            </div>)}
    </figure>;
}

export function RoiCalculator() {
    const [raw, setRaw] = useState<Record<RoiField, string>>(() => Object.fromEntries(
        Object.entries(roiDefaults).map(([name, value]) => [name, String(value)])
    ) as Record<RoiField, string>);
    const values = fields.map(field => ({ ...field, value: parseAmount(raw[field.name], field) }));
    const valid = values.every(field => field.value !== null);
    const metrics = valid ? calculateRoi(Object.fromEntries(values.map(field => [field.name, field.value])) as typeof roiDefaults) : null;

    return <div className="calculator-layout">
        <div className="public-panel calculator-inputs" role="group" aria-label="ROI assumptions">
            {values.map(field => <CalculatorInput key={field.name} {...field} raw={raw[field.name]} evaluated={field.value}
                onChange={value => setRaw(previous => ({ ...previous, [field.name]: value }))} />)}
        </div>
        <div className="public-panel calculator-results">
            <h3>Illustrative results</h3>
            {metrics ? <>
                <dl className="roi-metrics" aria-live="polite">
                    {[
                        ['Annual net capacity value after estimated costs', rupees.format(metrics.annualNet)],
                        ['Potential preparation time reduction', metrics.timeReduction === null ? 'Unavailable at zero manual time' : `${numbers.format(metrics.timeReduction)}%`],
                        ['Monthly cases', numbers.format(metrics.monthlyCases)],
                        ['Monthly staff hours recovered', formatHours(metrics.hoursRecovered)],
                        ['Monthly staff capacity value', rupees.format(metrics.monthlyCapacity)],
                        ['Annual staff capacity value', rupees.format(metrics.annualCapacity)],
                    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="calculator-value" key={value}>{value}</dd></div>)}
                </dl>
                {metrics.hoursRecovered < 0 && <p className="marketing-note">With these inputs the assisted workflow uses more staff time.</p>}
                <EffortChart manual={metrics.manualHours} assisted={metrics.assistedHours} />
            </> : <p role="status">{valid ? 'The assumptions produce values outside the supported calculation range.' : 'Correct the highlighted inputs to see a projection.'}</p>}
            <p className="marketing-note">These projections estimate staff capacity, measured in time and valued at the input hourly rate. Validate times and costs in a hospital pilot before making a spending decision.</p>
        </div>
    </div>;
}

export function RevenueCalculator() {
    const [hospitals, setHospitals] = useState('10');
    const [contract, setContract] = useState('180000');
    const count = parseAmount(hospitals, { integer: true });
    const value = parseAmount(contract);

    return <div className="public-panel revenue-calculator">
        <div className="calculator-inputs" role="group" aria-label="Commercial assumptions">
            <CalculatorInput name="hospital-count" label="Paying hospitals" integer raw={hospitals} onChange={setHospitals} evaluated={count} />
            <CalculatorInput name="annual-contract" label="Annual contract value per hospital (₹)" raw={contract} onChange={setContract} evaluated={value} />
        </div>
        <div>
            <h3>Illustrative annual recurring revenue</h3>
            <output htmlFor="hospital-count annual-contract" aria-live="polite" className="revenue-value">
                {count === null || value === null ? 'Correct the highlighted inputs' : <span className="calculator-value" key={`${count}-${value}`}>{rupees.format(annualRecurringRevenue(count, value))}</span>}
            </output>
            <p className="marketing-note">Paying hospitals × annual contract value. Use this hypothetical commercial scenario to explore contract and adoption assumptions.</p>
        </div>
    </div>;
}

const feasibilityFields = [
    ['cases', 'Insurance cases per month', { integer: true }],
    ['minutes', 'Administrative minutes recovered per case', {}],
    ['staffCost', 'Staff cost per hour (₹)', {}],
    ['affectedPercent', 'Cases with documented preventable financial losses (%)', { max: 100 }],
    ['amountPerAffected', 'Documented unrecovered amount per affected case (₹)', {}],
    ['avoidPercent', 'Hypothetical share of preventable loss avoided (%)', { max: 100 }],
    ['subscription', 'Monthly subscription (₹)', {}],
    ['deployment', 'Deployment cost in year one (₹)', {}],
    ['integration', 'Integration cost in year one (₹)', {}],
    ['support', 'Maintenance and support for year one (₹)', {}],
] as const;

export function FeasibilityCalculator() {
    const [input, setInput] = useState(() => Object.fromEntries(
        Object.entries(feasibilityDefaults).map(([name, value]) => [name, String(value)]),
    ));
    const assumptions = feasibilityFields.map(([name, label, options]) => ({
        name, label, options, value: parseAmount(input[name], options),
    }));
    const output = assumptions.every(field => field.value !== null)
        ? calculateFeasibility(Object.fromEntries(assumptions.map(({ name, value }) => [name, value])) as typeof feasibilityDefaults)
        : null;
    return <div className="calculator-layout">
        <div className="public-panel calculator-inputs" role="group" aria-label="Shadow pilot feasibility assumptions">
            {assumptions.map(({ name, label, options, value }) => <CalculatorInput key={name} name={'pilot-' + name} label={label}
                raw={input[name]} evaluated={value} {...options} onChange={raw => setInput(previous => ({ ...previous, [name]: raw }))} />)}
        </div>
        <div className="public-panel calculator-results">
            <h3>Hypothetical first-year scenario</h3>
            {output ? <dl className="roi-metrics" aria-live="polite">{[
                ['Net economic value', rupees.format(output.net)],
                ['Staff hours recovered', formatHours(output.hours)],
                ['Value of recovered staff capacity', rupees.format(output.capacity)],
                ['Hypothetical financial loss avoided', rupees.format(output.avoided)],
                ['Total estimated economic value', rupees.format(output.gross)],
                ['Deployment, integration, support and subscription costs', rupees.format(output.costs)],
                ['Break-even monthly subscription', output.breakEvenSubscription < 0 ? 'No nonnegative subscription' : rupees.format(output.breakEvenSubscription)],
                ['Break-even affected cases per year', output.breakEvenAffected === null ? 'Unavailable under these assumptions' : numbers.format(output.breakEvenAffected)],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="calculator-value">{value}</dd></div>)}</dl>
                : <p role="status">Correct the highlighted inputs to see the scenario.</p>}
            <p className="marketing-note">Count staff capacity and avoided financial losses separately. Use documented affected cases as inputs. Flagged variances and confirmed receipts are excluded from the projection. The break-even calculation values recovered staff time at the input hourly rate.</p>
        </div>
    </div>;
}

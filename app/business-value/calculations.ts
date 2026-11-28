export const roiDefaults = {
    dailyCases: 50,
    operatingDays: 30,
    manualMinutes: 25,
    assistedMinutes: 10,
    hourlyCost: 200,
    monthlyFee: 15000,
    annualCosts: 0,
};

type RoiInputs = typeof roiDefaults;

export function parseAmount(input: string, { optional = false, integer = false, max = Number.MAX_SAFE_INTEGER } = {}) {
    const text = input.trim();
    if (!text) return optional ? 0 : null;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const amount = Number(text);
    return Number.isFinite(amount) && amount >= 0 && amount <= max && (!integer || Number.isInteger(amount)) ? amount : null;
}

export function calculateRoi({ dailyCases, operatingDays, manualMinutes, assistedMinutes, hourlyCost, monthlyFee, annualCosts }: RoiInputs) {
    const monthlyCases = dailyCases * operatingDays;
    const minutesRecovered = manualMinutes - assistedMinutes;
    const hoursRecovered = monthlyCases === 0 ? 0 : monthlyCases * minutesRecovered / 60;
    const monthlyCapacity = hoursRecovered * hourlyCost;
    const annualCapacity = monthlyCapacity * 12;
    const annualNet = annualCapacity - monthlyFee * 12 - annualCosts;
    const timeReduction = manualMinutes > 0 ? minutesRecovered / manualMinutes * 100 : null;
    const manualHours = monthlyCases * manualMinutes / 60;
    const assistedHours = monthlyCases * assistedMinutes / 60;
    if (![monthlyCases, hoursRecovered, monthlyCapacity, annualCapacity, annualNet, timeReduction ?? 0, manualHours, assistedHours].every(Number.isFinite)) return null;
    return { monthlyCases, hoursRecovered, monthlyCapacity, annualCapacity, annualNet, timeReduction, manualHours, assistedHours };
}

export function annualRecurringRevenue(hospitals: number, annualContractValue: number) {
    return hospitals * annualContractValue;
}

export const feasibilityDefaults = {
    cases: 1500, minutes: 10, staffCost: 200, affectedPercent: 3, amountPerAffected: 8000,
    avoidPercent: 25, subscription: 15000, deployment: 50000, integration: 50000, support: 30000,
};

export function calculateFeasibility(input: typeof feasibilityDefaults) {
    const hours = input.cases * 12 * input.minutes / 60;
    const capacity = hours * input.staffCost;
    const affectedCases = input.cases * 12 * input.affectedPercent / 100;
    const avoidedPerCase = input.amountPerAffected * input.avoidPercent / 100;
    const avoided = affectedCases * avoidedPerCase;
    const gross = capacity + avoided;
    const fixed = input.deployment + input.integration + input.support;
    const costs = input.subscription * 12 + fixed;
    const breakEvenAffected = costs <= capacity ? 0 : avoidedPerCase > 0 ? Math.ceil((costs - capacity) / avoidedPerCase) : null;
    return { hours, capacity, avoided, gross, costs, net: gross - costs,
        breakEvenSubscription: (gross - fixed) / 12, breakEvenAffected };
}

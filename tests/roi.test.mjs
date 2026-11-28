import assert from 'node:assert/strict';
import test from 'node:test';
import { annualRecurringRevenue, calculateFeasibility, calculateRoi, feasibilityDefaults, parseAmount, roiDefaults } from '../app/business-value/calculations.ts';

test('the illustrative assumptions produce the published ROI', () => {
    assert.deepEqual(calculateRoi(roiDefaults), {
        monthlyCases: 1500, hoursRecovered: 375, monthlyCapacity: 75000, annualCapacity: 900000,
        annualNet: 720000, timeReduction: 60, manualHours: 625, assistedHours: 250,
    });
    assert.equal(calculateRoi({ ...roiDefaults, annualCosts: 20000 }).annualNet, 700000);
});

test('longer assisted preparation yields negative time and capacity recovery', () => {
    const result = calculateRoi({ ...roiDefaults, assistedMinutes: 30 });
    assert.equal(result.timeReduction, -20);
    assert.equal(result.hoursRecovered, -125);
    assert.equal(result.annualNet, -480000);
});

test('zero baseline has no meaningful percentage and zero cases still incur the fee', () => {
    const result = calculateRoi({ ...roiDefaults, dailyCases: 0, manualMinutes: 0 });
    assert.equal(result.timeReduction, null);
    assert.equal(result.hoursRecovered, 0);
    assert.equal(result.annualNet, -180000);
    assert.equal(calculateRoi({ ...roiDefaults, manualMinutes: 0 }).hoursRecovered, -250);
    assert.equal(calculateRoi({ ...roiDefaults, assistedMinutes: 25 }).timeReduction, 0);
});

test('input parsing handles blanks, negative values, fractions, invalid ranges and overflow', () => {
    for (const amount of ['', '-1', 'Infinity', '1e999', '0x10', 'invalid']) assert.equal(parseAmount(amount), null);
    assert.equal(parseAmount('', { optional: true }), 0);
    assert.equal(parseAmount('0'), 0);
    assert.equal(parseAmount('3.5'), 3.5);
    assert.equal(parseAmount('3.5', { integer: true }), null);
    assert.equal(parseAmount('32', { max: 31 }), null);
    assert.equal(calculateRoi({ ...roiDefaults, manualMinutes: Number.MIN_VALUE }), null);
});

test('revenue is an independent scenario using paying hospitals and annual contract value', () => {
    assert.equal(annualRecurringRevenue(10, 180000), 1800000);
    assert.equal(annualRecurringRevenue(0, 180000), 0);
    assert.equal(annualRecurringRevenue(10, 0), 0);
});


test('first-year feasibility separates staff capacity, hypothetical loss and costs', () => {
    assert.deepEqual(calculateFeasibility(feasibilityDefaults), {
        hours: 3000, capacity: 600000, avoided: 1080000, gross: 1680000, costs: 310000,
        net: 1370000, breakEvenSubscription: 1550000 / 12, breakEvenAffected: 0,
    });
    const downside = calculateFeasibility({ ...feasibilityDefaults, minutes: 0, avoidPercent: 0 });
    assert.equal(downside.net, -310000);
    assert.equal(downside.breakEvenAffected, null);
    assert.equal(calculateFeasibility({ ...feasibilityDefaults, minutes: 0 }).breakEvenAffected, 155);
});

// @ts-nocheck

/**
 * @typedef {Object} Stats
 * @property {number} STR
 * @property {number} INT
 * @property {number} WIS
 * @property {number} CON
 * @property {number} DEX
 */

/**
 * @typedef {Object} Item
 * @property {string} name
 * @property {string} type
 * @property {string} class
 * @property {Stats} stats
 * @property {string|number} [level]
 */

/**
 * @typedef {Object} OptimizationResult
 * @property {boolean} success
 * @property {Item[]} items
 * @property {Stats} finalBaseStats
 * @property {Stats} finalStats
 * @property {Stats} pointsAllocated
 * @property {Stats} missingStats
 * @property {string[]} warnings
 */

const LEVEL_1_BASE = 15; // 3 * 5
const PTS_PER_LEVEL = 2;
const STATS = ['STR', 'INT', 'WIS', 'CON', 'DEX'];

/** EXP cost per stat point by class */
const PRIMARY_STATS = {
    priest: ['WIS', 'INT'],
    wizard: ['WIS', 'INT'],
    rogue: ['STR', 'DEX'],
    warrior: ['STR', 'CON'],
    monk: ['STR', 'INT', 'CON']
};
const PRIMARY_COST = 2_000_000;
const NON_PRIMARY_COST = 10_000_000;

export function statCost(stat, heroClass) {
    const primary = PRIMARY_STATS[heroClass?.toLowerCase()] || [];
    return primary.includes(stat) ? PRIMARY_COST : NON_PRIMARY_COST;
}

/**
 * Given per-stat deficits and available points, compute the minimum
 * EXP cost of [missing stats, points to spend].
 * Strategy: spend points on most expensive deficit stats first so as to
 * minimise the EXP cost of stats we cannot cover.
 */
function expScore(deficits, availablePoints, heroClass) {
    const statsByCost = [...STATS].sort((a, b) => statCost(b, heroClass) - statCost(a, heroClass));
    let remaining = availablePoints;
    let missingExp = 0;
    let spentExp = 0;
    const rem = { ...deficits };

    for (const stat of statsByCost) {
        const d = rem[stat] || 0;
        if (d > 0 && remaining > 0) {
            const spend = Math.min(d, remaining);
            spentExp += spend * statCost(stat, heroClass);
            remaining -= spend;
            rem[stat] = d - spend;
        }
    }
    for (const stat of STATS) {
        missingExp += (rem[stat] || 0) * statCost(stat, heroClass);
    }
    return [missingExp, spentExp];
}

/**
 * Validates if the allocated stats match the level availability.
 * Formula: Sum(BaseStats) + AvailablePoints == (Level - 1) * 2 + 15
 * @param {Stats} baseStats
 * @param {number} availablePoints
 * @returns {boolean}
 */
export function validateStats(level, baseStats, availablePoints) {
    const totalAllocated = Object.values(baseStats).reduce((a, b) => a + b, 0);
    const expectedTotal = (level - 1) * PTS_PER_LEVEL + LEVEL_1_BASE;

    if (level >= 99) {
        return (totalAllocated + availablePoints) > expectedTotal;
    }

    return (totalAllocated + availablePoints) === expectedTotal;
}

/**
 * Compute the total stat deficit against desiredStats given a stats object.
 * Negative item stats are absorbed by surplus (stats already above target)
 * before creating new deficit — so Stone Cross -5 INT is free if INT > target+5.
 * @param {Stats} stats
 * @param {Stats} desired
 * @returns {number}
 */
function totalDeficit(stats, desired) {
    let total = 0;
    for (const k of STATS) {
        const diff = desired[k] - stats[k];
        if (diff > 0) total += diff;
    }
    return total;
}

/**
 * Compute per-stat deficits (clamped at 0; surplus is not penalised).
 */
function getDeficits(stats, desired) {
    const d = {};
    let total = 0;
    for (const k of STATS) {
        const diff = desired[k] - stats[k];
        d[k] = diff > 0 ? diff : 0;
        total += d[k];
    }
    return { deficits: d, total };
}

/**
 * Compute deficit if `item` is added to `baseStats`.
 * Correctly handles negative item stats — they consume surplus before adding deficit.
 */
function deficitWithItem(baseStats, item, desired) {
    let total = 0;
    for (const k of STATS) {
        const have = baseStats[k] + (item.stats[k] || 0);
        const diff = desired[k] - have;
        if (diff > 0) total += diff;
    }
    return total;
}

/**
 * Optimizes equipment and point allocation.
 * Uses Phase 1 (greedy) + Phase 2 (coordinate descent) to find
 * a near-optimal item set that minimises total stat deficit.
 *
 * @param {Stats} currentBaseStats
 * @param {Stats} desiredStats
 * @param {Item[]} availableItems
 * @param {number} availablePoints
 * @param {string} heroClass
 * @param {number} level
 * @param {Item[]} [lockedItems=[]]
 * @returns {OptimizationResult}
 */
export function optimize(currentBaseStats, desiredStats, availableItems, availablePoints, heroClass, level, lockedItems = []) {
    // 1. Filter items by class and level
    const candidates = availableItems.filter(item => {
        const classMatch = item.class.toLowerCase() === 'all' || item.class.toLowerCase() === heroClass.toLowerCase();
        let reqLevel = 1;
        if (typeof item.level === 'number') reqLevel = item.level;
        else if (item.level === 'Master') reqLevel = 99;
        else if (isValidNumber(item.level)) reqLevel = parseInt(item.level);
        return classMatch && level >= reqLevel;
    });

    // 2. Define slot counts
    const slots = {
        'helm': 1, 'earring': 1, 'necklace': 1, 'armor': 1, 'weapon': 1,
        'ring': 2, 'boot': 1, 'shield': 1, 'gauntlet': 2, 'greaves': 1, 'belt': 1
    };

    let equippedItems = [];

    // "baseStats" during optimisation = currentBaseStats + locked item stats
    // We track this separately so Phase 1/2 can build stats incrementally.
    const lockedStats = { ...currentBaseStats };

    // 2.1 Process locked items first
    for (const item of lockedItems) {
        if (slots[item.type] > 0) {
            slots[item.type]--;
            for (const stat of STATS) {
                lockedStats[stat] += (item.stats[stat] || 0);
            }
            equippedItems.push({ ...item, isLocked: true });
        }
    }

    // Build per-slot candidate arrays for open (non-locked) slots
    // openSlots[i] = array of candidate items for that slot instance
    const openSlots = [];
    for (const [slotType, count] of Object.entries(slots)) {
        const slotCandidates = candidates.filter(i => i.type.toLowerCase() === slotType.toLowerCase());
        for (let i = 0; i < count; i++) {
            openSlots.push(slotCandidates);
        }
    }
    const numSlots = openSlots.length;

    /**
     * Compute total deficit given lockedStats plus an array of chosen items.
     * O(numSlots * 5) — fast.
     */
    const deficitForChoices = (choices) => {
        const stats = { ...lockedStats };
        for (const item of choices) {
            if (!item) continue;
            for (const stat of STATS) stats[stat] += (item.stats[stat] || 0);
        }
        return totalDeficit(stats, desiredStats);
    };

    // Compute per-stat deficits for a given stats object
    const perStatDeficit = (stats) => {
        const d = {};
        for (const stat of STATS) {
            const diff = desiredStats[stat] - stats[stat];
            d[stat] = diff > 0 ? diff : 0;
        }
        return d;
    };

    // Compare two sets of per-stat deficits using EXP-weighted scoring.
    // Returns true if defA is strictly better than defB.
    const isBetter = (defA, defB) => {
        const [mA, pA] = expScore(defA, availablePoints, heroClass);
        const [mB, pB] = expScore(defB, availablePoints, heroClass);
        return mA < mB || (mA === mB && pA < pB);
    };


    // --- Phase 1: Greedy initialisation ---
    const chosenItems = new Array(numSlots).fill(null);
    const runningStats = { ...lockedStats };

    for (let si = 0; si < numSlots; si++) {
        let bestItem = null;
        let bestDef = perStatDeficit(runningStats);

        for (const item of openSlots[si]) {
            const withItem = { ...runningStats };
            for (const stat of STATS) withItem[stat] += (item.stats[stat] || 0);
            const d = perStatDeficit(withItem);
            if (isBetter(d, bestDef)) {
                bestDef = d;
                bestItem = item;
            }
        }

        chosenItems[si] = bestItem;
        if (bestItem) {
            for (const stat of STATS) runningStats[stat] += (bestItem.stats[stat] || 0);
        }
    }

    // --- Phase 2: Coordinate descent ---
    const MAX_ITER = 10;
    for (let iter = 0; iter < MAX_ITER; iter++) {
        let improved = false;

        for (let si = 0; si < numSlots; si++) {
            const statsOthers = { ...lockedStats };
            for (let j = 0; j < numSlots; j++) {
                if (j !== si && chosenItems[j]) {
                    for (const stat of STATS) statsOthers[stat] += (chosenItems[j].stats[stat] || 0);
                }
            }

            let bestItem = null;
            let bestDef = perStatDeficit(statsOthers); // baseline: empty slot

            for (const item of openSlots[si]) {
                const withItem = { ...statsOthers };
                for (const stat of STATS) withItem[stat] += (item.stats[stat] || 0);
                const d = perStatDeficit(withItem);
                if (isBetter(d, bestDef)) {
                    bestDef = d;
                    bestItem = item;
                }
            }

            if (bestItem !== chosenItems[si]) {
                chosenItems[si] = bestItem;
                improved = true;
            }
        }

        if (!improved) break;
    }

    // Assemble final equipped items and compute final stats
    for (const item of chosenItems) {
        if (item) equippedItems.push({ ...item });
    }

    let currentStats = { ...currentBaseStats };
    for (const item of equippedItems) {
        for (const stat of STATS) currentStats[stat] += (item.stats[stat] || 0);
    }

    // 4. Allocate available stat points to remaining deficits
    const { deficits: finalDeficits } = getDeficits(currentStats, desiredStats);
    let pointsAllocated = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };
    let missingStats = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };
    let pointsToSpend = availablePoints;
    let success = true;

    // Allocate available points — spend on most expensive stats first to minimise EXP cost
    const statsByCost = [...STATS].sort((a, b) => statCost(b, heroClass) - statCost(a, heroClass));
    for (const stat of statsByCost) {
        const need = finalDeficits[stat];
        if (need > 0) {
            if (pointsToSpend >= need) {
                pointsAllocated[stat] = need;
                pointsToSpend -= need;
                currentStats[stat] += need;
            } else {
                pointsAllocated[stat] = pointsToSpend;
                currentStats[stat] += pointsToSpend;
                const remaining = need - pointsToSpend;
                pointsToSpend = 0;
                success = false;
                missingStats[stat] = remaining;
                currentStats[stat] += remaining;
            }
        }
    }

    const finalBaseStats = {};
    for (const stat of STATS) {
        finalBaseStats[stat] = currentBaseStats[stat] + pointsAllocated[stat] + missingStats[stat];
    }

    return {
        success,
        items: equippedItems,
        finalBaseStats,
        finalStats: currentStats,
        pointsAllocated,
        missingStats,
        warnings: []
    };
}

function isValidNumber(val) {
    return !isNaN(parseFloat(val)) && isFinite(val);
}

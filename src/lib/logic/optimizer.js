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
        // User request: "level >= 99, sum > formula"
        return (totalAllocated + availablePoints) > expectedTotal;
    }

    return (totalAllocated + availablePoints) === expectedTotal;
}

/**
 * Optimizes equipment and point allocation.
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
        // Class check: 'all' or match specific class
        const classMatch = item.class.toLowerCase() === 'all' || item.class.toLowerCase() === heroClass.toLowerCase();
        // Level check: item level <= hero level. Handle 'Master' as special (e.g. 99+ or just high)
        // For simplicity, let's treat 'Master' as requiring level 99 for now, or 1 if not specified.
        let reqLevel = 1;
        if (typeof item.level === 'number') reqLevel = item.level;
        else if (item.level === 'Master') reqLevel = 99; // Placeholder
        else if (isValidNumber(item.level)) reqLevel = parseInt(item.level);

        return classMatch && level >= reqLevel;
    });

    // 2. Define Slots
    // 1x helm, 1x earring, 1x necklace, 1x armor, 1x weapon, 2x rings, 1x boot, 1x shield, 2x gauntlets, 2x greaves, 1x belt
    const slots = {
        'helm': 1,
        'earring': 1,
        'necklace': 1,
        'armor': 1,
        'weapon': 1,
        'ring': 2,
        'boot': 1,
        'shield': 1,
        'gauntlet': 2,
        'greaves': 1,
        'belt': 1
    };

    let equippedItems = [];
    let currentStats = { ...currentBaseStats };
    let pointsToSpend = availablePoints;

    // 2.1 Handle Locked Items
    for (const item of lockedItems) {
        if (slots[item.type] > 0) {
            slots[item.type]--;
            // Add stats
            for (const stat in item.stats) {
                currentStats[stat] = (currentStats[stat] || 0) + (item.stats[stat] || 0);
            }
            // Add to equipped
            equippedItems.push({ ...item, isLocked: true });
        }
    }

    // 3. Greedy Approach (Simplified for prototype)
    // Find items that help with the biggest deficit.
    // Since this is a complex knapsack-like problem, we will use a heuristic:
    // Sort items by "total relevant stat gain" (stats that we actually need).

    // Helper to calc deficit
    const getDeficits = (curr) => {
        const d = {};
        let total = 0;
        for (const k of ['STR', 'INT', 'WIS', 'CON', 'DEX']) {
            const diff = desiredStats[k] - curr[k];
            d[k] = diff > 0 ? diff : 0;
            total += d[k];
        }
        return { deficits: d, total };
    };

    // Very silly greedy allocator for items:
    // Foreach slot type...
    for (const [slotType, count] of Object.entries(slots)) {
        const slotItems = candidates.filter(i => i.type.toLowerCase() === slotType.toLowerCase());

        for (let i = 0; i < count; i++) {
            // Find best item for this slot
            // Score = sum of stats that reduce deficit
            let bestItem = null;
            let bestScore = 0; // Was -1, changed to 0 to only pick items that help (score > 0)

            const { deficits } = getDeficits(currentStats);

            for (const item of slotItems) {
                // Don't equip same item twice if unique? 
                // Assuming generic items can be duped, specifically named unique items maybe not?
                // For now allow dupes.

                let score = 0;
                // Total stats no longer used as tie-breaker per user request
                // let totalStats = 0; 

                for (const stat of ['STR', 'INT', 'WIS', 'CON', 'DEX']) {
                    const gain = item.stats[stat] || 0;
                    // totalStats += gain;
                    // If we need this stat, it's valuable.
                    if (deficits[stat] > 0) {
                        score += gain * 100; // Weight deficit reduction much higher
                    }
                }

                // Add total stats as tie-breaker/fallback -- DISABLED
                // score += totalStats;

                if (score > bestScore) {
                    bestScore = score;
                    bestItem = item;
                }
            }

            if (bestItem) {
                // Update current stats
                for (const stat of ['STR', 'INT', 'WIS', 'CON', 'DEX']) {
                    currentStats[stat] += (bestItem.stats[stat] || 0);
                }

                // Calculate remaining deficit total for display
                const { deficits: remainingDeficits, total: remainingDeficitTotal } = getDeficits(currentStats);

                // Clone item to attach transient data without mutating the source
                const itemWithMeta = {
                    ...bestItem,
                    remainingDeficitTotal: remainingDeficitTotal,
                    remainingDeficits
                };
                equippedItems.push(itemWithMeta);
            }
        }
    }

    // 4. Fill with points
    // Check remaining deficits
    const { deficits: finalDeficits, total: finalDeficitTotal } = getDeficits(currentStats);
    let pointsAllocated = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };
    let missingStats = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };

    // Distribute points greedy?
    // We just need to check if Total(Deficits) <= AvailablePoints?
    // Not exactly, because points are fungible.
    // Yes, if we have X points, we can reduce deficits by X total.

    let success = true;
    let warnings = [];

    // Allocate points
    for (const stat of ['STR', 'INT', 'WIS', 'CON', 'DEX']) {
        const need = finalDeficits[stat];
        if (need > 0) {
            if (pointsToSpend >= need) {
                pointsAllocated[stat] = need;
                pointsToSpend -= need;
                currentStats[stat] += need;
            } else {
                pointsAllocated[stat] = pointsToSpend;
                currentStats[stat] += pointsToSpend;
                const remainingMissing = need - pointsToSpend;
                pointsToSpend = 0;
                success = false;
                missingStats[stat] = remainingMissing;
                currentStats[stat] += remainingMissing;
            }
        }
    }

    let finalBaseStats = {};
    for (const stat of ['STR', 'INT', 'WIS', 'CON', 'DEX']) {
        finalBaseStats[stat] = currentBaseStats[stat] + pointsAllocated[stat] + missingStats[stat];
    }

    return {
        success,
        items: equippedItems,
        finalBaseStats,
        finalStats: currentStats,
        pointsAllocated,
        missingStats,
        warnings
    };
}

function isValidNumber(val) {
    return !isNaN(parseFloat(val)) && isFinite(val);
}

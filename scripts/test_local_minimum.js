import { optimize } from '../src/lib/logic/optimizer.js';

const currentBaseStats = { STR: 3, INT: 98, WIS: 91, CON: 13, DEX: 3 };
// Desired Stats from screenshot: 16 STR / 112 INT / 120 WIS / 16 CON / 18 DEX.
// Base stats + 3 pts available.
// However, the test only has a few items. Let's use the actual targets from the second screenshot to replicate the bad Ruby ear pick.
// Screenshot 2 targets: 3 STR / 108 INT / 96 WIS / 3 CON / 3 DEX
const desiredStats = { STR: 3, INT: 108, WIS: 96, CON: 3, DEX: 3 };
const availablePoints = 3;
const heroClass = 'priest';
const level = 99;
const isMaster = false;

// Only providing a limited subset of items to force the local minimum scenario
const items = [
    {
        name: "Holy Disciple Gown",
        type: "armor",
        class: "all",
        stats: { STR: 0, INT: 0, WIS: 4, CON: -5, DEX: 0 },
        level: 80
    },
    {
        name: "Luathas Ruby Earring",
        type: "earring",
        class: "all",
        stats: { STR: 0, INT: 2, WIS: 1, CON: 0, DEX: 0 },
        level: 41
    },
    {
        name: "Luathas Coral Earring",
        type: "earring",
        class: "all",
        stats: { STR: 0, INT: 3, WIS: 0, CON: 0, DEX: 0 },
        level: 8
    },
    {
        name: "Hy-Brasyl Belt",
        type: "belt",
        class: "all",
        stats: { STR: 0, INT: 0, WIS: 1, CON: 1, DEX: 0 },
        level: 11
    },
    {
        name: "Luathas Ruby Ring",
        type: "ring",
        class: "all",
        stats: { STR: 0, INT: 1, WIS: 0, CON: 0, DEX: 0 },
        level: 6
    },
    {
        name: "Luathas Boots",
        type: "boot",
        class: "all",
        stats: { STR: 0, INT: 1, WIS: 0, CON: 0, DEX: 0 },
        level: 1
    },
    {
        name: "Luathas Wooden Shield",
        type: "shield",
        class: "all",
        stats: { STR: 0, INT: 1, WIS: 0, CON: 0, DEX: 0 },
        level: 3
    },
    {
        name: "Luathas Leather Gauntlet",
        type: "gauntlet",
        class: "all",
        stats: { STR: 0, INT: 1, WIS: 0, CON: 0, DEX: 0 },
        level: 9
    },
    {
        name: "Luathas Leather Greaves",
        type: "greaves",
        class: "all",
        stats: { STR: 0, INT: 1, WIS: 0, CON: 0, DEX: 0 },
        level: 6
    }
];

console.log('--- Testing Local Minimum ---');
const result = optimize(currentBaseStats, desiredStats, items, availablePoints, heroClass, level, isMaster, []);

console.log('Success:', result.success);
console.log('Items Equipped:', result.items.map(i => i.name));
console.log('Points Allocated:', Object.values(result.pointsAllocated).reduce((a, b) => a + b, 0), 'out of', availablePoints);

const hasCoral = result.items.find(i => i.name === 'Luathas Coral Earring');
const hasBelt = result.items.find(i => i.name === 'Hy-Brasyl Belt');
const pointsSpent = Object.values(result.pointsAllocated).reduce((a, b) => a + b, 0);

if (hasCoral && hasBelt && pointsSpent === 0) {
    console.log('PASS: Optimizer escaped local minimum to find the optimal plan.');
} else {
    console.log('FAIL: Optimizer stuck in local minimum.');
}

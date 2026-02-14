import { optimize } from '../src/lib/logic/optimizer.js';

// Mock Data
const currentBaseStats = { STR: 10, INT: 10, WIS: 10, CON: 10, DEX: 10 };
const desiredStats = { STR: 10, INT: 10, WIS: 10, CON: 10, DEX: 10 }; // Already met
const availablePoints = 0;
const heroClass = 'warrior';
const level = 99;

const items = [
    {
        name: 'Test Armor',
        type: 'armor',
        class: 'warrior',
        stats: { STR: 5, INT: 0, WIS: 0, CON: 5, DEX: 0 },
        level: 1
    },
    {
        name: 'Weak Armor',
        type: 'armor',
        class: 'warrior',
        stats: { STR: 1, INT: 0, WIS: 0, CON: 1, DEX: 0 },
        level: 1
    }
];

console.log('--- Testing Optimizer ---');
const result = optimize(currentBaseStats, desiredStats, items, availablePoints, heroClass, level);

console.log('Success:', result.success);
console.log('Items Equipped:', result.items.map(i => i.name));

// Check if 'Test Armor' is equipped
const armor = result.items.find(i => i.type === 'armor');
if (armor && armor.name === 'Test Armor') {
    console.log('PASS: Best armor equipped despite no deficits.');
} else {
    console.log('FAIL: Armor not equipped or wrong armor selected.');
    console.log('Result Items:', result.items);
}

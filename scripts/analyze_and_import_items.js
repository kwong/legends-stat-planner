import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the item dump
const dumpPath = path.join(__dirname, '..', 'item_dump.js');
const itemsPath = path.join(__dirname, '..', 'src', 'lib', 'data', 'items.json');

// Extract JSON from the dump file
const dumpContent = fs.readFileSync(dumpPath, 'utf-8');
const jsonMatch = dumpContent.match(/JSON\.parse\('(.+)'\)/);
if (!jsonMatch) {
    console.error('Could not extract JSON from item_dump.js');
    process.exit(1);
}

const jsonString = jsonMatch[1]
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');

const dumpData = JSON.parse(jsonString);
const existingItems = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));

// Map of slot types
const slotMapping = {
    'Necklace': 'necklace',
    'Armor': 'armor',
    'Foot': 'boot',
    'Weapon': 'weapon',
    'RHand': 'ring',
    'LHand': 'ring',
    'Shield': 'shield',
    'Helmet': 'helmet',
    'RArm': 'gauntlet',
    'LArm': 'gauntlet',
    'Leg': 'greaves',
    'Earring': 'earring',
    'Waist': 'belt'
};

// Class mapping (bitwise flags)
const classMapping = {
    1: 'all',
    2: 'Warrior',
    4: 'Rogue',
    8: 'Wizard',
    16: 'Priest',
    32: 'Monk'
};

function getClassList(allowedClasses) {
    if (allowedClasses === 1) return ['all'];

    const classes = [];
    for (const [flag, className] of Object.entries(classMapping)) {
        const flagNum = parseInt(flag);
        if (flagNum > 1 && (allowedClasses & flagNum)) {
            classes.push(className);
        }
    }
    return classes.length > 0 ? classes : ['all'];
}

function parseStats(statsString) {
    const stats = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };

    if (!statsString || statsString === '-') return stats;

    // Match stat patterns like "Str +2", "Int +1", etc.
    const statPattern = /(Str|Int|Wis|Con|Dex)\s*([+-]\d+)/gi;
    let match;

    while ((match = statPattern.exec(statsString)) !== null) {
        const statName = match[1].toUpperCase();
        const value = parseInt(match[2]);
        stats[statName] = value;
    }

    return stats;
}

function hasRelevantStats(stats) {
    return Object.values(stats).some(v => v !== 0);
}

// Build a set of existing items for quick lookup
const existingItemSet = new Set(
    existingItems.items.map(item =>
        `${item.name}|${item.type}|${item.class}`
    )
);

console.log(`Total items in dump: ${dumpData.equipment.length}`);
console.log(`Total items in items.json: ${existingItems.items.length}`);
console.log('');

const newItemsToAdd = [];
const itemsWithStats = [];

for (const item of dumpData.equipment) {
    const mappedType = slotMapping[item.equipmentSlot];
    if (!mappedType) continue;

    const stats = parseStats(item.stats);
    if (!hasRelevantStats(stats)) continue;

    itemsWithStats.push(item.name);

    const allowedClasses = parseInt(item.allowedClasses, 10);
    const classList = getClassList(allowedClasses);

    for (const cls of classList) {
        const key = `${item.name}|${mappedType}|${cls}`;
        if (!existingItemSet.has(key)) {
            newItemsToAdd.push({
                name: item.name,
                type: mappedType,
                class: cls,
                stats: stats,
                _source: item
            });
        }
    }
}

console.log(`Items with stat bonuses in dump: ${itemsWithStats.length}`);
console.log(`New items to add: ${newItemsToAdd.length}`);
console.log('');

if (newItemsToAdd.length > 0) {
    console.log('Sample of new items to add:');
    newItemsToAdd.slice(0, 10).forEach(item => {
        console.log(`  - ${item.name} (${item.type}, ${item.class}): ${JSON.stringify(item.stats)}`);
    });
    console.log('');

    // Ask for confirmation
    console.log(`Ready to add ${newItemsToAdd.length} new items to items.json`);
    console.log('Items will be appended to the existing file.');

    // Add items
    const itemsToAppend = newItemsToAdd.map(({ name, type, class: cls, stats }) => ({
        name,
        type,
        class: cls,
        stats
    }));

    existingItems.items.push(...itemsToAppend);

    fs.writeFileSync(itemsPath, JSON.stringify(existingItems, null, 2));
    console.log(`✓ Successfully added ${newItemsToAdd.length} items to items.json`);
} else {
    console.log('No new items to add.');
}

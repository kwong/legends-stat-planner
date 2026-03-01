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

console.log(`Items in dump: ${dumpData.equipment.length}`);
console.log(`Items in items.json: ${existingItems.items.length}`);
console.log('');

// Prefixes for God items
const godPrefixes = ['Cail', 'Luathas', 'Glioca', 'Ceannlaidir', 'Fiosachd'];

function getBaseName(name) {
    let baseName = name;
    for (const prefix of godPrefixes) {
        if (name.startsWith(prefix + ' ')) {
            baseName = name.substring(prefix.length + 1);
            break;
        }
    }
    return baseName.toLowerCase();
}

// Build a map of items from dump by name for quick lookup
const dumpItemMap = new Map();
dumpData.equipment.forEach(item => {
    // We store the base name as the key in the map
    const key = getBaseName(item.name);
    if (!dumpItemMap.has(key)) {
        dumpItemMap.set(key, []);
    }
    dumpItemMap.get(key).push(item);
});

// Helper to parse level
function parseLevel(levelRequired, levelDisplay) {
    // Handle "Master" level
    if (levelDisplay === 'Master' || levelDisplay === 'Maste') {
        return 99;
    }

    // Try to parse levelRequired as number
    const level = parseInt(levelRequired, 10);
    if (!isNaN(level) && level > 0) {
        return level;
    }

    // Default to 1 if no valid level found
    return 1;
}

let updated = 0;
let notFound = 0;
let multipleMatches = 0;
const notFoundItems = [];

// Update each item in items.json with level data
existingItems.items.forEach(item => {
    const key = getBaseName(item.name);
    const matches = dumpItemMap.get(key);

    if (!matches || matches.length === 0) {
        notFound++;
        notFoundItems.push(item.name);
        item.level = 1; // Default to level 1
        return;
    }

    // Use the first match
    const dumpItem = matches[0];
    item.level = parseLevel(dumpItem.levelRequired, dumpItem.levelDisplay);
    updated++;
});

console.log(`Updated: ${updated} items`);
console.log(`Not found in dump (defaulted to level 1): ${notFound} items`);
console.log('');

if (notFoundItems.length > 0 && notFound < 20) {
    console.log('Items not found in dump:');
    notFoundItems.forEach(name => console.log(`  - ${name}`));
    console.log('');
}

// Verify level distribution
const levelCounts = {};
existingItems.items.forEach(item => {
    const level = item.level || 1;
    levelCounts[level] = (levelCounts[level] || 0) + 1;
});

console.log('Level distribution:');
Object.keys(levelCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
    console.log(`  Level ${level}: ${levelCounts[level]} items`);
});
console.log('');

// Write back to items.json
fs.writeFileSync(itemsPath, JSON.stringify(existingItems, null, 2));
console.log('✓ Successfully updated items.json with level requirements');

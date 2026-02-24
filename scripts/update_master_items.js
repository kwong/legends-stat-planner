const fs = require('fs');

// item_dump.js is a TURBOPACK bundle — extract the embedded JSON string
const raw = fs.readFileSync('./item_dump.js', 'utf8');

// The data is in: e.v(JSON.parse('...'))
// The single-quotes inside are escaped as \'
const start = raw.indexOf("JSON.parse('") + "JSON.parse('".length;
const end = raw.indexOf("')", start);
const jsonStr = raw.slice(start, end).replace(/\\'/g, "'");

const dump = JSON.parse(jsonStr);
const allDumpItems = dump.equipment;

// Find all master items by levelDisplay
const masterNames = new Set(
    allDumpItems
        .filter(i => i.levelDisplay === 'Master')
        .map(i => i.name.toLowerCase())
);

console.log(`Master items in dump: ${masterNames.size}`);

// Update items.json
const itemData = JSON.parse(fs.readFileSync('./src/lib/data/items.json', 'utf8'));

let updated = 0;
let notFound = [];

for (const name of masterNames) {
    const match = itemData.items.find(i => i.name.toLowerCase() === name);
    if (match) {
        if (match.level !== 'Master') {
            match.level = 'Master';
            updated++;
        }
    } else {
        notFound.push(name);
    }
}

console.log(`Updated ${updated} items to Master level`);
if (notFound.length) {
    console.log(`Not found in items.json (${notFound.length}):`);
    notFound.forEach(n => console.log('  -', n));
}

fs.writeFileSync('./src/lib/data/items.json', JSON.stringify(itemData, null, 2));
console.log('items.json saved.');

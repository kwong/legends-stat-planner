import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DUMP_FILE = path.join(__dirname, '../item_dump.js');
const ITEMS_FILE = path.join(__dirname, '../src/lib/data/items.json');

// --- Mappings ---

const SLOT_MAP = {
    'Necklace': 'necklace',
    'Helmet': 'helmet',
    'Weapon': 'weapon',
    'Armor': 'armor', // Note: Check specifically if 'OverCoat' should change this
    'Shield': 'shield',
    'RHand': 'ring',
    'Earring': 'earring',
    'Waist': 'belt',
    'Boot': 'boot',
    'Leg': 'greaves', // Verify if we want 'greaves' or 'armor'. Existing items use 'greaves'? Let's check.
    // 'items.json' has 'boot', 'helmet', 'armor', 'weapon', 'shield', 'necklace', 'ring', 'earring', 'belt', 'gauntlet', 'greaves' (maybe?).
    // Actually, looking at previous 'items.json' content:
    // "type": "boot", "type": "belt", "type": "weapon".
    // Let's assume 'greaves' is a type if it exists in DB, otherwise map to something else.
    // The dump has 'Greaves' as equipmentType.
    // Let's check a known item: 'Leather Greaves'.
    // In dump: equipmentSlot: "Leg", equipmentType: "Greaves".
    // In our DB: we need to support 'greaves' or map it.
    // Optimization logic supports: 'weapon', 'helmet', 'armor', 'shield', 'necklace', 'ring', 'earring', 'belt', 'gauntlet', 'greaves', 'boot'.
    // So 'Leg' -> 'greaves' is correct.
    'RArm': 'gauntlet',
    'OverCoat': 'armor' // Treating OverCoat as armor for now, or maybe specific slot?
    // If logic supports 'overcoat', use it. But optimizer likely wants 'armor' or specific slot.
    // Let's check optimizer.js again. START_ITEMS structure:
    // weapon, shield, helmet, armor, necklace, ring, gauntlet, belt, greaves, earring, boot.
    // No 'overcoat'. So map 'OverCoat' to 'armor'?
    // But 'Armor' slot is usually occupied.
    // Wait, 'OverCoat' items like "Black Tuxedo", "Dullahan Chainmail".
    // Use 'armor' for now.
};

// Checking optimizer's supported slots:
// const slots = { 'weapon': 1, 'shield': 1, 'helmet': 1, 'armor': 1, 'necklace': 1, 'ring': 2, 'gauntlet': 1, 'belt': 1, 'greaves': 1, 'earring': 2, 'boot': 1 };
// So 'gauntlet' and 'greaves' are valid types.

const CLASS_MAP = {
    1: ['warrior', 'rogue', 'wizard', 'priest', 'monk'], // Assuming 1 = All (Common)
    2: ['warrior'],
    4: ['rogue'],
    8: ['wizard'],
    16: ['priest'],
    32: ['monk']
    // Combinations will be calculated bitwise.
    // e.g. 24 = 16 + 8 -> wizard, priest
};

function getClassList(mask) {
    if (mask === 1) return ['all']; // Special case for 'Common'

    // Check if it's 1 (Base/Common) AND other bits? Usually 1 is exclusive or 'All'.
    // Let's try bitwise.

    const classes = [];
    if (mask & 2) classes.push('warrior');
    if (mask & 4) classes.push('rogue');
    if (mask & 8) classes.push('wizard');
    if (mask & 16) classes.push('priest');
    if (mask & 32) classes.push('monk');

    // If no bits matched but mask > 0? (Like 1).
    if (classes.length === 0 && mask === 1) return ['all'];

    return classes.length > 0 ? classes : ['all']; // Default to all if unknown?
}


// --- Main ---

function main() {
    console.log('--- Starting Item Import ---');

    console.log('Reading files...');
    const itemsRaw = fs.readFileSync(ITEMS_FILE, 'utf8');
    const itemsData = JSON.parse(itemsRaw);
    const existingItems = itemsData.items || [];
    console.log(`Loaded ${existingItems.length} existing items.`);

    const dumpRaw = fs.readFileSync(DUMP_FILE, 'utf8');
    // Extract JSON from the dump file.
    // It looks like: ... JSON.parse('{"equipment":[{...}]}') ...
    const jsonMatch = dumpRaw.match(/JSON\.parse\('(.+)'\)/);
    if (!jsonMatch || !jsonMatch[1]) {
        console.error('Failed to extract JSON from dump file.');
        return;
    }

    // The string inside JSON.parse is escaped similarly to a string literal in JS code,
    // e.g. 'Beginner\'s Pendant'.
    // We need to unescape it before parsing as JSON.
    // Actually, JSON.parse takes a string. If the file content is `JSON.parse('...')`, the content inside `'...'` is a string literal.
    // It might differ slightly from standard JSON if it has escaped single quotes.
    // Let's try standard parse.
    let dumpString = jsonMatch[1];

    // Data in dump file might have escaped characters for JS string literal.
    // e.g. \' -> '
    dumpString = dumpString.replace(/\\'/g, "'");
    // Also \\ -> \ ?
    dumpString = dumpString.replace(/\\\\/g, "\\");

    let dumpData;
    try {
        dumpData = JSON.parse(dumpString);
    } catch (e) {
        console.error('Failed to parse dump JSON:', e);
        // Fallback: try to clean it more?
        return;
    }

    const newEquipment = dumpData.equipment || [];
    console.log(`Found ${newEquipment.length} items in dump.`);

    const newItemsToAdd = [];
    const statsRegex = /(Str|Int|Wis|Con|Dex)\s*([+-]?\d+)/gi;

    for (const item of newEquipment) {
        // 1. Check if name exists
        if (existingItems.some(i => i.name === item.name)) {
            continue; // Skip duplicates
        }

        // 2. Parse stats
        const statsStr = item.stats;
        if (!statsStr || statsStr === '-') continue;

        const stats = { STR: 0, INT: 0, WIS: 0, CON: 0, DEX: 0 };
        let hasRelevantStats = false;
        let match;

        // Reset regex index
        statsRegex.lastIndex = 0;

        // We need to loop over all matches
        while ((match = statsRegex.exec(statsStr)) !== null) {
            const statName = match[1].toUpperCase();
            const statVal = parseInt(match[2], 10);

            if (['STR', 'INT', 'WIS', 'CON', 'DEX'].includes(statName) && statVal !== 0) {
                stats[statName] = statVal;
                hasRelevantStats = true;
            }
        }

        if (!hasRelevantStats) continue;

        // 3. Map Type
        const slotKey = item.equipmentSlot;
        // Check map
        const mappedType = SLOT_MAP[slotKey];
        if (!mappedType) {
            // console.log(`Skipping unknown slot: ${slotKey} for ${item.name}`);
            continue;
        }

        // 4. Map Class
        const allowedClasses = parseInt(item.allowedClasses, 10);
        const classList = getClassList(allowedClasses);
        // Our updated items.json uses a single string if it's strictly one class, or 'all'.
        // But some items might be multi-class.
        // Existing items.json schema: "class": "all" or "wizard" etc.
        // It seems to support a single string.
        // If multiple classes (e.g. Wizard + Priest), we might need to duplicate the item or change schema?
        // Let's check items.json again.
        // "class": "all", "class": "wizard".
        // If we have mixed classes, we probably can't represent it easily with current schema unless specific logic handles arrays.
        // Most items are likely single class or 'all'.
        // If "Wizard" and "Priest" (24 -> 8+16):
        // If we just pick one, it's incorrect.
        // Let's check how 'optimize' handles class.
        // In optimizer.js: `if (item.class !== 'all' && item.class !== heroClass) continue;`
        // So it only supports single class or 'all'.
        // This is a limitation.
        // Workaround: If multiple classes, create multiple entries? Or fix optimizer?
        // Fixing usage is better: change "class" to allow array? or check inclusion.
        // But for now, to avoid breaking schema, if multiple classes found, what do we do?
        // Maybe skip mixed-class items if they aren't 'all'? 
        // Or if it's Wizard+Priest (Mage classes), maybe just import as 'wizard' and 'priest' if we can?
        // Actually, let's just create separate entries for now? "Name (Wiz)", "Name (Pri)"? No, that's messy.
        // Checking existing items... "Magus..." is Wizard. 
        // If we find multi-class, let's log it.

        let targetClass = 'all';
        if (classList.length === 1) {
            targetClass = classList[0];
        } else if (classList.length === 5) {
            targetClass = 'all';
        } else {
            // Mixed. e.g. [ 'wizard', 'priest' ]
            // We can't put array in 'class' field if optimizer expects string.
            // But JS starts with loose typing...
            // Let's look at optimizer: `item.class !== 'all' && item.class !== heroClass`
            // If item.class is array: `['wiz','pri'] !== 'wiz'` is true.
            // So we'd filter it out.
            // We should ideally update schema to support arrays, but that's scope creep.
            // For now, I will SKIP items with multiple specific classes to be safe, 
            // OR I can duplicate the item object for each class?
            // "Name": "X", Class: "Wizard"
            // "Name": "X", Class: "Priest"
            // This works for the optimizer data structure (array of objects). Same name, different class. Perfect.

            // Loop for each class in list
            classList.forEach(cls => {
                newItemsToAdd.push({
                    name: item.name,
                    type: mappedType,
                    class: cls,
                    stats: stats
                });
            });
            continue; // Created multiple, so continue out of loop
        }

        newItemsToAdd.push({
            name: item.name,
            type: mappedType,
            class: targetClass,
            stats: stats
        });
    }

    console.log(`Identified ${newItemsToAdd.length} new items to add.`);

    if (newItemsToAdd.length > 0) {
        const updatedItems = [...existingItems, ...newItemsToAdd];

        // Sort? Maybe by type then name? Not strictly necessary.

        const newJson = { items: updatedItems };
        fs.writeFileSync(ITEMS_FILE, JSON.stringify(newJson, null, 4), 'utf8');
        console.log('Successfully updated items.json');
    } else {
        console.log('No new items to add.');
    }
}

main();

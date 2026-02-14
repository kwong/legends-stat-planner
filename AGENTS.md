# Overview

This is a static frontend app that helps Legends of Chaos players plan their stats.

# Functional requirements
1. Ability to put in current stats and desired stats. There are 5 stats:
    - STR: Strength
    - INT: Intelligence
    - WIS: Wisdom
    - CON: Constitution
    - DEX: Dexterity
2. Ability to select level (1-99)and hero class. There are 5 classes:
    - Warrior
    - Wizard
    - Priest
    - Rogue
    - Monk
3. Ability to put in available stat points.
4. Ability to get an optimized plan to achieve desired stats from current stats
    - What items to equip
    - How many points from available stats to put in

5. The app must validate that the current stat points allocated and available stat points == (level - 1) *2 + 15. Example:
    - Level 1: 15 + 0 == (1 - 1) * 2 + 15 = 15
    - Level 10: 18 + 15 == (10 - 1) * 2 + 15 = 33

# Non-functional requirements
- Use a SvelteKit frontend
- Use Tailwind CSS for styling
- Use javascript only. I don't want typescript.
- Vercel Free Tier deployment. It is important to stay on the free tier. 
- Items will be defined in the below json format. Use https://legendsaoc.com/manual/equipment to populate the items.


```
{
    "items": [
        {
            "name": "Item Name",
            "type": "weapon",
            "class": "priest",
            "stats": {
                "STR": 10,
                "INT": -5,
                "WIS": -5,
                "CON": 0,
                "DEX": 0,
            }
        }
    ]
}
```

# Constraints
1. There is a limit to how much equipment a player can equip:
    - 1x helm
    - 1x earring
    - 1x necklace
    - 1x armor
    - 1x weapon
    - 2x rings
    - 1x boot
    - 1x shield
    - 2x gauntlets
    - 2x greaves
2. Players start at level 1 with 3 stats allocated to each attribute (3 * 5), each level gives them 2 stat points

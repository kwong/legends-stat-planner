# Overview

This is a static frontend app that helps Legends of Chaos players plan their stats.

# Functional requirements
1. Ability to put in current stats and desired stats. There are 5 stats:
    - STR: Strength
    - INT: Intelligence
    - WIS: Wisdom
    - CON: Constitution
    - DEX: Dexterity
2. Ability to select level (1-99) and hero class. There are 5 classes:
    - Warrior
    - Wizard
    - Priest
    - Rogue
    - Monk
3. Ability to put in available stat points.
4. Ability to get an optimized plan to achieve desired stats from current stats
    - What items to equip. Recommended items must be equipable by the selected class and level.
    - How many points from available stats to put in

5. The app must validate that the current stat points allocated and available stat points <= (level - 1) *2 + 29. Example:
    - Level 1: 15 + 0 <= (1 - 1) * 2 + 29 = 29
    - Level 10: 18 + 15 <= (10 - 1) * 2 + 29 = 47
    - Only 15 points are given at level 1. 
    - Masters have the ability to buy stats. Making their stat points go above 225.
6. Ability to swap out items from the optimized plan.
7. Ability to show the number of points away from reaching desired attribute (for each attribute). Show this under warnings.
8. Ability to reset an item back to what the optimized plan suggested.

9. Ability to reset all items back to what the optimized plan suggested.


# Non-functional requirements
- Use a SvelteKit frontend
- Use Tailwind CSS for styling
- Use javascript only. I don't want typescript.
- Vercel Free Tier deployment. It is important to stay on the free tier. 
- Items will be defined in the below json format. Use https://legendsaoc.com/manual/equipment to populate the items.
- It should save the user's inputs locally so they he can resume even after he's closed the browser
- For item configurations in the optimization plan, prefer simple icons over buttons with text
- Base stat points and target stat points cannot be less than 3 for any attribute
- Available statpoints cannot be less than 0


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
    - 1x earrings
    - 1x necklace
    - 1x armor
    - 1x weapon
    - 2x rings
    - 1x boot
    - 1x shield
    - 2x gauntlets
    - 1x greaves
    - 1x belt
2. Players start at level 1 with 3 stats allocated to each attribute (3 * 5), each level gives them 2 stat points


# Items
items can be enchanted by gods and become <God> <Type> <Item>:
 Gauntlet, Greaves, Earrings, Boots, Shield can be enchanted
 There are a few types of gauntlets, greaves, and shield: Wooden, Leather, Iron, Mythril, Hy-brasyl
 There are these type of rings: Ruby, Lapis, Grave, Amethyst, Jade
 There are a few types of boots: Regular (Empty type), Cured (+1 dex), Shagreen (+2 dex), Cordovan (+3 dex), Saffian (+4 dex), Magma (+5 dex), Enchanted (+6 dex)
 There are a few types of earrings: Silver (+1 str), Gold (+2 str), Ruby (+1 int, +1 wis), Coral (+2 int), Beryl (+1 int)
 Cail: +1 con
 Luathas: +1 int
 Glioca: +1 wis
 Ceannlaidir: +1 str    
 Fiosachd: +1 dex
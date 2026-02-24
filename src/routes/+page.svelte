<script>
    import { optimize, validateStats } from '$lib/logic/optimizer';
    import itemData from '$lib/data/items.json';
    import { onMount } from 'svelte';

    let level = $state(1);
    let heroClass = $state('warrior');
    let availablePoints = $state(0);
    
    // Base stats (user's current allocation)
    let currentStats = $state({
        STR: 3,
        INT: 3,
        WIS: 3,
        CON: 3,
        DEX: 3
    });

    // Desired stats
    let desiredStats = $state({
        STR: 3,
        INT: 3,
        WIS: 3,
        CON: 3,
        DEX: 3
    });
    
    // Add locked items state
    let lockedItems = $state([]);
    let isPickerOpen = $state(false);
    let pickerSlotType = $state('');
    let pickerSearch = $state('');

    let result = $state(null);
    let loaded = false;

    // Load from local storage on mount
    onMount(() => {
        const saved = localStorage.getItem('legends-planner-state');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                level = data.level ?? 1;
                heroClass = data.heroClass ?? 'warrior';
                availablePoints = data.availablePoints ?? 0;
                if (data.currentStats) currentStats = data.currentStats;
                if (data.desiredStats) desiredStats = data.desiredStats;
                if (data.lockedItems) lockedItems = data.lockedItems; // Load locked items
            } catch (e) {
                console.error('Failed to load state', e);
            }
        }
        loaded = true;
    });

    // Save on change (using $effect)
    $effect(() => {
        if (loaded) {
            const state = {
                level,
                heroClass,
                availablePoints,
                currentStats,
                desiredStats,
                lockedItems // Save locked items
            };
            localStorage.setItem('legends-planner-state', JSON.stringify(state));
        }
    });

    
    // Reactively validate
    let isValid = $derived(validateStats(level, currentStats, availablePoints));

    function handleCalculate() { // Renamed from handleOptimize
        const stats = { STR: currentStats.STR, INT: currentStats.INT, WIS: currentStats.WIS, CON: currentStats.CON, DEX: currentStats.DEX };
        
        // Basic Client-side Validation for input
        if (!validateStats(level, stats, availablePoints)) {
             // We can still try to optimize but maybe warn? 
             // actually validateStats returns true if valid.
             // If false, it means stats don't match level.
             // But the user might be experimenting. Let's just run it but maybe show a toast?
             // For now, just run.
        }

        result = optimize(
            currentStats, 
            desiredStats, 
            itemData.items, 
            availablePoints, 
            heroClass, 
            level,
            lockedItems // New parameter
        );
    }
    
    function openPicker(type) {
        pickerSlotType = type;
        pickerSearch = '';
        isPickerOpen = true;
    }
    
    function selectItem(item) {
        // If selecting same item, strictly nothing happens (or unlock?)
        // If unlocked, remove from lockedItems
        // For now, assume "Swap" always means "Lock this new item".
        
        // Remove any existing locked item for this slot IF we reached cap?
        // Actually, for slots with multiple count (Ring x2), how do we know WHICH one to replace?
        // Simple UI: The "Swap" button is on a specific row.
        // But the row corresponds to a result from the optimizer. 
        // If we have 2 rings, and click Swap on the first one, we should probably replace THAT one.
        // But `lockedItems` is just a list fed into the optimizer.
        
        // Strategy:
        // `lockedItems` should ideally map to the specific "instance" we are replacing.
        // But since the optimizer regenerates the list every time, indices are unstable.
        
        // Simplified Strategy for V1:
        // When you pick an item for "Ring", it adds it to `lockedItems`.
        // If `lockedItems` already has 2 rings, we need to pop one?
        // Let's rely on the user to "Unlock" if they want to clear space, OR just cycle.
        
        // Better UX:
        // The results table shows what is equipped. 
        // If I click "Swap" on an equipped item, I want to replace IT.
        // If the item was already locked, replace it in `lockedItems`.
        // If it was auto-generated, add the new choice to `lockedItems`.
        
        // We need to track which *index* of the slot type we are swapping if there are multiple (rings).
        // Let's pass the item being replaced to `openPicker`.
    }
    
    let itemToReplace = $state(null);
    
    function startSwap(item) {
        itemToReplace = item;
        pickerSlotType = item.type;
        pickerSearch = '';
        isPickerOpen = true;
    }
    
    function confirmSwap(newItem) {
        // New list of locked items
        let newLocked = [...lockedItems];
        
        // If we are replacing an item that was ALREADY locked, find and replace it
        if (itemToReplace && itemToReplace.isLocked) {
            // Find the specific item to replace in lockedItems
            const idx = newLocked.findIndex(i => i.name === itemToReplace.name && i.type === itemToReplace.type); 
            if (idx >= 0) {
                newLocked[idx] = newItem;
            } else {
                newLocked.push(newItem);
            }
        } else {
            // Replacing an auto-generated item means we are ADDING a lock.
            
            // Count existing locked items of this type
            const lockedOfType = newLocked.filter(i => i.type === newItem.type);
            const slotLimits = { 'ring': 2, 'gauntlet': 2, 'earring': 2, 'default': 1 };
            const limit = slotLimits[newItem.type] || slotLimits['default'];
            
            if (lockedOfType.length < limit) {
                // We have room, just add it
                newLocked.push(newItem);
            } else {
                // No room, we must remove one.
                // FIFO logic: remove the first one of that type to make room
                const firstIdx = newLocked.findIndex(i => i.type === newItem.type);
                if (firstIdx >= 0) {
                    newLocked.splice(firstIdx, 1);
                }
                newLocked.push(newItem);
            }
        }
        
        lockedItems = newLocked;
        isPickerOpen = false;
        itemToReplace = null; // Clear the item being replaced
        handleCalculate();
    }

    function unlockItem(item) {
        if (!item.isLocked) return;
        
        const newLocked = [...lockedItems];
        // Find index of item to remove
        const idx = newLocked.findIndex(i => i.name === item.name && i.type === item.type);
        if (idx >= 0) {
            newLocked.splice(idx, 1);
            lockedItems = newLocked;
            handleCalculate();
        }
    }
    
    function resetAllLocked() {
        if (confirm('Are you sure you want to unlock all items?')) {
            lockedItems = [];
            handleCalculate();
        }
    }
    
    // Auto-run calculate when lockedItems changes?
    $effect(() => {
        // Avoid initial run if result is null?
        if (loaded) { // Only run after initial load to prevent infinite loop with localStorage
            handleCalculate();
        }
    });

    // Filtered items for picker
    let pickerItems = $derived(
        isPickerOpen 
        ? itemData.items.filter(i => {
            const classMatch = i.class.toLowerCase() === 'all' || i.class.toLowerCase() === heroClass.toLowerCase();
            const levelMatch = level >= (i.level || 1);
            return i.type === pickerSlotType && classMatch && levelMatch &&
                   i.name.toLowerCase().includes(pickerSearch.toLowerCase());
          })
        : []
    );

</script>

<!-- Modals -->
{#if isPickerOpen}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onclick={() => isPickerOpen = false} role="button" tabindex="0" onkeydown={e => e.key === 'Escape' && (isPickerOpen = false)}>
    <div class="bg-slate-800 border border-slate-600 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onclick={e => e.stopPropagation()} role="button" tabindex="0" onkeydown={() => {}}>
        <div class="p-4 border-b border-slate-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-white capitalize">Select {pickerSlotType}</h3>
            <button class="text-slate-400 hover:text-white" onclick={() => isPickerOpen = false}>✕</button>
        </div>
        <div class="p-4 border-b border-slate-700">
            <input 
                type="text" 
                bind:value={pickerSearch} 
                placeholder="Search items..." 
                class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:border-amber-500 outline-none"
                autofocus
            />
        </div>
        <div class="flex-1 overflow-y-auto p-2">
            {#each pickerItems as item}
                <button 
                    class="w-full text-left p-3 hover:bg-slate-700 rounded flex justify-between items-center group transition-colors"
                    onclick={() => confirmSwap(item)}
                >
                    <span class="font-medium text-slate-200 group-hover:text-white">{item.name}</span>
                    <div class="flex flex-col items-end">
                        <div class="text-xs text-slate-400">
                             {#each Object.entries(item.stats) as [k, v]}
                                {#if v !== 0}
                                    <span class="ml-2 {v > 0 ? 'text-emerald-400' : 'text-red-400'}">{k}:{v > 0 ? '+' : ''}{v}</span>
                                {/if}
                            {/each}
                        </div>
                        <div class="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
                            Level {item.level || 1} • {item.class}
                        </div>
                    </div>
                </button>
            {/each}
            {#if pickerItems.length === 0}
                <div class="p-4 text-center text-slate-500">No items found.</div>
            {/if}
        </div>
    </div>
</div>
{/if}

<div class="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-amber-500/30">
    <header class="max-w-6xl mx-auto mb-8 text-center">
        <h1 class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500 mb-2">
            Legends Stat Planner
        </h1>
        <p class="text-slate-400">Optimize your build for Legends: Age of Chaos</p>
    </header>

    <main class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <!-- INPUT SECTION -->
        <section class="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
            <h2 class="text-2xl font-semibold mb-6 text-amber-400 border-b border-slate-700 pb-2">Character Config</h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <!-- Level -->
                <div class="form-control">
                    <label class="label text-sm text-slate-400 mb-1" for="level">Level (1-99+)</label>
                    <input type="number" id="level" min="1" class="input bg-slate-700 border-slate-600 text-white rounded p-2 w-full focus:ring-2 focus:ring-amber-500 outline-none" bind:value={level} />
                </div>
                
                <!-- Class -->
                <div class="form-control">
                    <label class="label text-sm text-slate-400 mb-1" for="class">Class</label>
                    <select id="class" class="select bg-slate-700 border-slate-600 text-white rounded p-2 w-full focus:ring-2 focus:ring-amber-500 outline-none" bind:value={heroClass}>
                        <option value="warrior">Warrior</option>
                        <option value="wizard">Wizard</option>
                        <option value="rogue">Rogue</option>
                        <option value="priest">Priest</option>
                        <option value="monk">Monk</option>
                    </select>
                </div>
            </div>

            <!-- Current Stats -->
            <div class="mb-6">
                 <h3 class="text-lg font-medium mb-3 text-slate-300">Base Stats (Current Allocation)</h3>
                 <div class="grid grid-cols-5 gap-2 text-center">
                    {#each Object.keys(currentStats) as stat}
                        <div class="flex flex-col">
                            <label class="text-xs text-slate-500 mb-1" for={`curr-${stat}`}>{stat}</label>
                            <input type="number" id={`curr-${stat}`} class="bg-slate-700 border-slate-600 text-white rounded p-1 w-full text-center text-sm" bind:value={currentStats[stat]} min="3" />
                        </div>
                    {/each}
                 </div>
            </div>

            <!-- Available Points -->
             <div class="mb-6">
                <label class="label text-sm text-slate-400 mb-1" for="avail">Available Stat Points</label>
                <input type="number" id="avail" class="bg-slate-700 border-slate-600 text-white rounded p-2 w-full" bind:value={availablePoints} min="0" />
                
                <div class="mt-2 text-xs">
                    Validation: 
                    {#if isValid}
                        <span class="text-green-400 font-bold">OK</span>
                    {:else}
                        <span class="text-orange-400 font-bold">
                            {#if level >= 99}
                                WARNING - Must be > {(level - 1) * 2 + 15}
                            {:else}
                                WARNING - Sum must equal {(level - 1) * 2 + 15}
                            {/if}
                        </span>
                    {/if}
                </div>
            </div>


            <!-- Desired Stats -->
            <div class="mb-8">
                <h3 class="text-lg font-medium mb-3 text-slate-300">Target Stats (Desired Total)</h3>
                <div class="grid grid-cols-5 gap-2 text-center">
                   {#each Object.keys(desiredStats) as stat}
                       <div class="flex flex-col">
                           <label class="text-xs text-slate-500 mb-1" for={`des-${stat}`}>{stat}</label>
                           <input type="number" id={`des-${stat}`} class="bg-slate-700 border-slate-600 text-white rounded p-1 w-full text-center text-sm" bind:value={desiredStats[stat]} min="3" />
                       </div>
                   {/each}
                </div>
           </div>

           <button 
                onclick={handleCalculate} 
                class="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-4 rounded transition-colors duration-200 shadow-md py-3"
            >
                Calculate Optimized Plan
           </button>

        </section>


        <!-- Results -->
        <section class="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 min-h-[400px]">
                                            <div class="flex justify-between items-center mb-6 border-b border-slate-700 pb-2">
                <h2 class="text-2xl font-semibold text-emerald-400">Optimization Result</h2>
                {#if lockedItems.length > 0}
                    <button 
                        onclick={resetAllLocked}
                        class="text-xs flex items-center gap-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 px-3 py-1 rounded border border-red-800/50 transition-colors"
                        title="Reset all locked items"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Reset ({lockedItems.length})
                    </button>
                {/if}
            </div>
            
            {#if !result}
                <div class="flex items-center justify-center h-64 text-slate-500 italic">
                    Configure your character and click Calculate.
                </div>
            {:else}
                <div class="space-y-6 animate-in fade-in duration-500">

                    {#if result.success}
                        <div class="bg-green-900/30 border border-green-500 text-green-200 p-4 rounded mb-6">
                            Success! You can reach your desired stats.
                        </div>
                    {/if}

                    <div>
                        <h3 class="text-lg font-medium text-slate-300 mb-3">Recommended Equipment</h3>
                        {#if result.items.length === 0}
                            <p class="text-slate-500 text-sm">No items needed or found.</p>
                        {:else}
                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr class="text-gray-400 border-b border-gray-600">
                                            <th class="py-2 px-2">Slot</th>
                                            <th class="py-2 px-2">Level</th>
                                            <th class="py-2 px-2">Item</th>
                                            <th class="py-2 px-2">Stats</th>
                                            <th class="py-2 px-2 w-20"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each result.items as item}
                                            <tr class="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors {item.isLocked ? 'bg-amber-900/10' : ''}">
                                                <td class="py-3 px-2 capitalize text-gray-400 text-sm">
                                                    {item.type}
                                                    {#if item.isLocked}
                                                        <span class="ml-1 inline-block text-amber-500" title="Locked">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
                                                              <path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd" />
                                                            </svg>
                                                        </span>
                                                    {/if}
                                                </td>
                                                <td class="py-3 px-2 text-sm text-slate-400">{item.level || 1}</td>
                                                <td class="py-3 px-2 font-medium text-white">{item.name}</td>
                                                <td class="py-3 px-2 text-sm text-gray-300">
                                                    {#each Object.entries(item.stats) as [k, v]}
                                                        {#if v !== 0}
                                                            <span class="mr-2 {v > 0 ? 'text-emerald-400' : 'text-red-400'}">{k}:{v}</span>
                                                        {/if}
                                                    {/each}
                                                </td>
                                                <td class="py-3 px-2 flex gap-1 justify-end">
                                                    {#if item.isLocked}
                                                        <button 
                                                            class="p-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded border border-red-800/50 transition-colors"
                                                            onclick={() => unlockItem(item)}
                                                            title="Unlock this slot"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                                              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                            </svg>
                                                        </button>
                                                    {/if}
                                                    <button 
                                                        class="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                                                        onclick={() => startSwap(item)}
                                                        title="Swap item"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                                          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {/if}
                    </div>

                    <!-- Points -->
                    <div>
                        <h3 class="text-lg font-medium text-slate-300 mb-3">Stat Point Allocation</h3>
                        <div class="grid grid-cols-5 gap-2">
                            {#each Object.entries(result.pointsAllocated) as [stat, pts]}
                                <div class="bg-slate-700 p-2 rounded text-center">
                                    <div class="text-xs text-slate-400">{stat}</div>
                                    <div class="text-xl font-bold {pts > 0 ? 'text-amber-400' : 'text-slate-500'}">+{pts}</div>
                                </div>
                            {/each}
                        </div>
                    </div>

                    {#if !result.success}
                        <div>
                            <h3 class="text-lg font-medium text-slate-300 mb-3">Additional Stat Points Required</h3>
                            <div class="grid grid-cols-5 gap-2">
                                {#each Object.entries(result.missingStats) as [stat, pts]}
                                    <div class="bg-slate-700 p-2 rounded text-center {pts > 0 ? 'border border-red-900/50' : ''}">
                                        <div class="text-xs text-slate-400">{stat}</div>
                                        <div class="text-xl font-bold {pts > 0 ? 'text-red-400' : 'text-slate-500'}">+{pts}</div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <div class="bg-emerald-900/30 border border-emerald-500/50 p-4 rounded text-center">
                            <span class="text-emerald-400 font-medium">Target stats achieved! No additional stat points required.</span>
                        </div>
                    {/if}

                    <!-- Final Stats -->
                    <div class="bg-slate-900 p-4 rounded border border-slate-700">
                         <h3 class="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Final stat points</h3>
                         <div class="flex justify-between text-sm">
                            {#each Object.entries(result.finalBaseStats) as [stat, val]}
                                <div class="text-center">
                                    <span class="block text-slate-500 text-xs">{stat}</span>
                                    <span class="font-bold text-white">{val}</span>
                                </div>
                            {/each}
                         </div>
                    </div>

                    <!-- Final Total Stats (with items) -->
                    <div class="bg-slate-900 p-4 rounded border border-slate-700">
                         <h3 class="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Final stat points (with items)</h3>
                         <div class="flex justify-between text-sm">
                            {#each Object.entries(result.finalStats) as [stat, val]}
                                <div class="text-center">
                                    <span class="block text-slate-500 text-xs">{stat}</span>
                                    <span class="font-bold text-white">{val}</span>
                                </div>
                            {/each}
                         </div>
                    </div>

                </div>
            {/if}
        </section>

    </main>
</div>

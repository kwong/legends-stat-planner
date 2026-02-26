<script>
    import { optimize, validateStats, statCost, statMaxValue } from '$lib/logic/optimizer';
    import itemData from '$lib/data/items.json';
    import { onMount } from 'svelte';

    let level = $state(1);
    let heroClass = $state('warrior');
    let availablePoints = $state(0);
    let isMaster = $state(false);
    let darkMode = $state(true);
    
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
    
    // User-specified items state
    let userItems = $state([]);
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
                if (data.userItems) userItems = data.userItems;
                // backwards-compat: old saves used 'lockedItems'
                if (!data.userItems && data.lockedItems) userItems = data.lockedItems;
                if (data.isMaster !== undefined) isMaster = data.isMaster;
                if (data.darkMode !== undefined) darkMode = data.darkMode;
            } catch (e) {
                console.error('Failed to load state', e);
            }
        } else {
            // No saved state — use system preference
            darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
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
                userItems,
                isMaster,
                darkMode
            };
            localStorage.setItem('legends-planner-state', JSON.stringify(state));
        }
    });

    
    // Reactively validate
    let isValid = $derived(validateStats(level, currentStats, availablePoints, isMaster, heroClass));

    function handleCalculate() {
        const stats = { STR: currentStats.STR, INT: currentStats.INT, WIS: currentStats.WIS, CON: currentStats.CON, DEX: currentStats.DEX };
        
        if (!validateStats(level, stats, availablePoints, isMaster, heroClass)) {
            // stats don't match level - still run
        }

        result = optimize(
            currentStats, 
            desiredStats, 
            itemData.items, 
            availablePoints, 
            heroClass, 
            level,
            isMaster,
            userItems
        );
    }
    
    function openPicker(type) {
        pickerSlotType = type;
        pickerSearch = '';
        isPickerOpen = true;
    }
    
    function selectItem(item) {}
    
    let itemToReplace = $state(null);
    
    function startSwap(item) {
        itemToReplace = item;
        pickerSlotType = item.type;
        pickerSearch = '';
        isPickerOpen = true;
    }
    
    function confirmSwap(newItem) {
        let newUserItems = [...userItems];
        
        if (itemToReplace && itemToReplace.isUserSpecified) {
            const idx = newUserItems.findIndex(i => i.name === itemToReplace.name && i.type === itemToReplace.type); 
            if (idx >= 0) {
                newUserItems[idx] = newItem;
            } else {
                newUserItems.push(newItem);
            }
        } else {
            const userItemsOfType = newUserItems.filter(i => i.type === newItem.type);
            const slotLimits = { 'ring': 2, 'gauntlet': 2, 'earring': 2, 'default': 1 };
            const limit = slotLimits[newItem.type] || slotLimits['default'];
            
            if (userItemsOfType.length < limit) {
                newUserItems.push(newItem);
            } else {
                const firstIdx = newUserItems.findIndex(i => i.type === newItem.type);
                if (firstIdx >= 0) {
                    newUserItems.splice(firstIdx, 1);
                }
                newUserItems.push(newItem);
            }
        }
        
        userItems = newUserItems;
        isPickerOpen = false;
        itemToReplace = null;
        handleCalculate();
    }

    function removeUserItem(item) {
        if (!item.isUserSpecified) return;
        
        const newUserItems = [...userItems];
        const idx = newUserItems.findIndex(i => i.name === item.name && i.type === item.type);
        if (idx >= 0) {
            newUserItems.splice(idx, 1);
            userItems = newUserItems;
            handleCalculate();
        }
    }
    
    function resetUserItems() {
        if (confirm('Are you sure you want to clear all user-specified items?')) {
            userItems = [];
            handleCalculate();
        }
    }

    // ── Export / Import ──────────────────────────────────────────────────────
    function exportPlan() {
        const state = {
            level,
            heroClass,
            availablePoints,
            currentStats,
            desiredStats,
            userItems,
            isMaster
        };
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `legends-plan-${heroClass}-lv${level}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    let fileInput;

    function triggerImport() {
        fileInput.click();
    }

    function handleImport(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                level = data.level ?? 1;
                heroClass = data.heroClass ?? 'warrior';
                availablePoints = data.availablePoints ?? 0;
                isMaster = data.isMaster ?? false;
                if (data.currentStats) currentStats = data.currentStats;
                if (data.desiredStats) desiredStats = data.desiredStats;
                userItems = data.userItems ?? data.lockedItems ?? [];
                handleCalculate();
            } catch (err) {
                alert('Failed to import plan: invalid JSON file.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
    
    // Auto-run calculate when userItems changes
    $effect(() => {
        if (loaded) {
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
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg w-full max-w-2xl xl:max-w-3xl max-h-[80vh] flex flex-col shadow-2xl" onclick={e => e.stopPropagation()} role="button" tabindex="0" onkeydown={() => {}}>
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 class="text-xl font-bold text-slate-800 dark:text-white capitalize">Select {pickerSlotType}</h3>
            <button class="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors" onclick={() => isPickerOpen = false}>✕</button>
        </div>
        <div class="p-4 border-b border-slate-200 dark:border-slate-700">
            <input 
                type="text" 
                bind:value={pickerSearch} 
                placeholder="Search items..." 
                class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-800 dark:text-white placeholder-slate-400 focus:border-amber-500 outline-none transition-colors"
                autofocus
            />
        </div>
        <div class="flex-1 overflow-y-auto p-2">
            {#each pickerItems as item}
                <button 
                    class="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex justify-between items-center group transition-colors"
                    onclick={() => confirmSwap(item)}
                >
                    <span class="font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">{item.name}</span>
                    <div class="flex flex-col items-end">
                        <div class="text-xs text-slate-400">
                             {#each Object.entries(item.stats) as [k, v]}
                                {#if v !== 0}
                                    <span class="ml-2 {v > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">{k}:{v > 0 ? '+' : ''}{v}</span>
                                {/if}
                            {/each}
                        </div>
                        <div class="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                            Level {item.level || 1} • {item.class}
                        </div>
                    </div>
                </button>
            {/each}
            {#if pickerItems.length === 0}
                <div class="p-4 text-center text-slate-400 dark:text-slate-500">No items found.</div>
            {/if}
        </div>
    </div>
</div>
{/if}

<input bind:this={fileInput} type="file" accept=".json,application/json" class="hidden" onchange={handleImport} />

<div class="{darkMode ? 'dark' : ''} min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-200 p-4 md:p-6 xl:p-8 font-sans selection:bg-amber-500/30 transition-colors duration-200">
    <header class="max-w-screen-2xl mx-auto mb-8 text-center relative">
        <h1 class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-500 mb-2">
            Legends Stat Planner
        </h1>
        <p class="text-slate-500 dark:text-slate-400">Optimize your build for Legends: Age of Chaos</p>

        <!-- Dark/Light toggle -->
        <button
            onclick={() => darkMode = !darkMode}
            class="absolute right-0 top-0 p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all duration-200"
            title="{darkMode ? 'Switch to light mode' : 'Switch to dark mode'}"
            aria-label="Toggle theme"
        >
            {#if darkMode}
                <!-- Sun icon -->
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
            {:else}
                <!-- Moon icon -->
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
            {/if}
        </button>
    </header>

    <main class="max-w-screen-2xl mx-auto grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[420px_1fr] gap-6 xl:gap-8 items-start">
        
        <!-- INPUT SECTION -->
        <section class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 md:sticky md:top-6 transition-colors">
            <h2 class="text-2xl font-semibold mb-6 text-amber-500 dark:text-amber-400 border-b border-slate-200 dark:border-slate-700 pb-2">Character Config</h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <!-- Level -->
                <div class="form-control">
                    <label class="label text-sm text-slate-500 dark:text-slate-400 mb-1" for="level">Level (1-99+)</label>
                    <input type="number" id="level" min="1" class="input bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded p-2 w-full focus:ring-2 focus:ring-amber-500 outline-none transition-colors" bind:value={level} />
                    {#if level >= 99}
                        <label class="flex items-center gap-2 mt-2 cursor-pointer select-none group">
                            <input type="checkbox" class="w-4 h-4 rounded accent-amber-500" bind:checked={isMaster} />
                            <span class="text-sm {isMaster ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}">Master</span>
                            {#if isMaster}<span class="text-xs text-amber-600">★</span>{/if}
                        </label>
                    {/if}
                </div>
                
                <!-- Class -->
                <div class="form-control">
                    <label class="label text-sm text-slate-500 dark:text-slate-400 mb-1" for="class">Class</label>
                    <select id="class" class="select bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded p-2 w-full focus:ring-2 focus:ring-amber-500 outline-none transition-colors" bind:value={heroClass}>
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
                 <h3 class="text-lg font-medium mb-3 text-slate-600 dark:text-slate-300">Base Stats (Current Allocation)</h3>
                 <div class="grid grid-cols-5 gap-2 text-center">
                    {#each Object.keys(currentStats) as stat}
                        <div class="flex flex-col">
                            <label class="text-xs text-slate-400 dark:text-slate-500 mb-1" for={`curr-${stat}`}>{stat}</label>
                            <input type="number" id={`curr-${stat}`} class="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded p-1 w-full text-center text-sm transition-colors" bind:value={currentStats[stat]} min="3" max={statMaxValue(stat, heroClass)} />
                        </div>
                    {/each}
                 </div>
            </div>

            <!-- Available Points -->
             <div class="mb-6">
                <label class="label text-sm text-slate-500 dark:text-slate-400 mb-1" for="avail">Available Stat Points</label>
                <input type="number" id="avail" class="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded p-2 w-full transition-colors" bind:value={availablePoints} min="0" />
                
                <div class="mt-2 text-xs">
                    Validation: 
                    {#if isValid}
                        <span class="text-green-500 dark:text-green-400 font-bold">OK</span>
                    {:else}
                        <span class="text-orange-500 dark:text-orange-400 font-bold">
                            {#if Object.entries(currentStats).some(([s, v]) => v > statMaxValue(s, heroClass))}
                                {@const badStat = Object.entries(currentStats).find(([s, v]) => v > statMaxValue(s, heroClass))}
                                {badStat[0]} exceeds cap ({statMaxValue(badStat[0], heroClass)} max)
                            {:else if level >= 99}
                                {#if !isMaster}
                                    {@const total = Object.values(currentStats).reduce((a, b) => a + b, 0) + availablePoints}
                                    {#if total > 211}
                                        Stats exceed non-master cap (211pts) — check <span class="text-amber-500 dark:text-amber-400">Master</span> if applicable
                                    {:else}
                                        Sum must equal 211
                                    {/if}
                                {:else}
                                    Sum must be ≥ 211
                                {/if}
                            {:else}
                                Sum must equal {(level - 1) * 2 + 15}
                            {/if}
                        </span>
                    {/if}
                </div>

            </div>


            <!-- Desired Stats -->
            <div class="mb-8">
                <h3 class="text-lg font-medium mb-3 text-slate-600 dark:text-slate-300">Target Stats (Desired Total)</h3>
                <div class="grid grid-cols-5 gap-2 text-center">
                   {#each Object.keys(desiredStats) as stat}
                       <div class="flex flex-col">
                           <label class="text-xs text-slate-400 dark:text-slate-500 mb-1" for={`des-${stat}`}>{stat}</label>
                           <input type="number" id={`des-${stat}`} class="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded p-1 w-full text-center text-sm transition-colors" bind:value={desiredStats[stat]} min="3" />
                       </div>
                   {/each}
                </div>
           </div>

           <div class="flex gap-2">
               <button
                   onclick={exportPlan}
                   class="flex-1 flex justify-center items-center gap-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded border border-slate-300 dark:border-slate-600 transition-colors"
                   title="Export plan as JSON"
               >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                       <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                   </svg>
                   Export
               </button>
               <button
                   onclick={triggerImport}
                   class="flex-1 flex justify-center items-center gap-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded border border-slate-300 dark:border-slate-600 transition-colors"
                   title="Import plan from JSON"
               >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                       <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5V21" />
                   </svg>
                   Import
               </button>
           </div>

        </section>


        <!-- Results -->
        <section class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 min-h-[400px] md:col-span-1 2xl:col-span-1 transition-colors">
            <div class="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-2">
                <h2 class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">Optimization Result</h2>
                {#if userItems.length > 0}
                    <button 
                        onclick={resetUserItems}
                        class="text-xs flex items-center gap-1 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 px-3 py-1 rounded border border-red-300 dark:border-red-800/50 transition-colors"
                        title="Clear all user-specified items"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Clear ({userItems.length})
                    </button>
                {/if}
            </div>
            
            {#if !result}
                <div class="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500 italic">
                    Configure your character to see results.
                </div>
            {:else}
                <div class="space-y-6 animate-in fade-in duration-500 xl:grid xl:grid-cols-[1fr_auto] xl:gap-8 xl:space-y-0 xl:items-start">

                    <!-- Left column: equipment table + success banner -->
                    <div class="xl:min-w-0">
                        {#if result.success}
                            <div class="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-200 p-3 rounded mb-4 text-sm">
                                ✓ You can reach your desired stats.
                            </div>
                        {/if}

                        <h3 class="text-lg font-medium text-slate-600 dark:text-slate-300 mb-2">Recommended Equipment</h3>
                        {#if result.items.length === 0}
                            <p class="text-slate-400 dark:text-slate-500 text-sm">No items needed or found.</p>
                        {:else}
                            <ul class="divide-y divide-slate-200 dark:divide-slate-700/60">
                                {#each result.items as item}
                                    <li class="flex items-center gap-3 py-2.5 px-2 rounded transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 {item.isUserSpecified ? 'bg-amber-50 dark:bg-amber-900/10' : ''}">
                                        <!-- Slot badge -->
                                        <div class="w-16 flex-shrink-0 text-center">
                                            <span class="inline-block text-[10px] font-semibold uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded px-1.5 py-0.5 leading-tight capitalize">
                                                {item.type}
                                            </span>
                                        </div>

                                        <!-- Item name + metadata -->
                                        <div class="flex-1 min-w-0">
                                            <span class="font-medium text-slate-800 dark:text-white text-sm leading-snug">{item.name}</span>
                                            <!-- Stat pills + level row -->
                                            <div class="flex items-center flex-wrap gap-1 mt-1">
                                                <span class="text-[10px] text-slate-400 dark:text-slate-500 mr-1">{item.level === 'Master' ? 'Master' : `Lv${item.level || 1}`}</span>
                                                {#each Object.entries(item.stats) as [k, v]}
                                                    {#if v !== 0}
                                                        <span class="inline-flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded {v > 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300'}">
                                                            {k}{v > 0 ? '+' : ''}{v}
                                                        </span>
                                                    {/if}
                                                {/each}
                                            </div>
                                        </div>

                                        <!-- Action buttons -->
                                        <div class="flex gap-1 flex-shrink-0">
                                            {#if item.isUserSpecified}
                                                <button 
                                                    class="p-1.5 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-500 dark:text-red-300 rounded border border-red-300 dark:border-red-800/50 transition-colors"
                                                    onclick={() => removeUserItem(item)}
                                                    title="Remove from user-specified items"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
                                                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                    </svg>
                                                </button>
                                            {/if}
                                            <button 
                                                class="p-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 rounded transition-colors"
                                                onclick={() => startSwap(item)}
                                                title="Swap item"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5">
                                                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                </svg>
                                            </button>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <!-- Right column: stat panels -->
                    <div class="xl:w-64 2xl:w-72 flex-shrink-0 space-y-4">

                        <!-- Points Allocation -->
                        <div>
                            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Available Stat Points Allocated</h3>
                            <div class="grid grid-cols-5 xl:grid-cols-1 gap-2">
                                {#each Object.entries(result.pointsAllocated) as [stat, pts]}
                                    <div class="bg-slate-100 dark:bg-slate-700 p-2 rounded xl:flex xl:items-center xl:justify-between text-center xl:text-left">
                                        <span class="text-xs text-slate-500 dark:text-slate-400 xl:font-medium">{stat}</span>
                                        <span class="block xl:inline text-lg xl:text-base font-bold {pts > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}">+{pts}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        {#if !result.success}
                            <!-- Missing Stats -->
                            <div>
                                <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Recommended Stats to Buy</h3>
                                <div class="grid grid-cols-5 xl:grid-cols-1 gap-2 mb-3">
                                    {#each Object.entries(result.missingStats) as [stat, pts]}
                                        <div class="bg-slate-100 dark:bg-slate-700 p-2 rounded xl:flex xl:items-center xl:justify-between text-center xl:text-left {pts > 0 ? 'border border-red-300 dark:border-red-900/50' : ''}">
                                            <div>
                                                <span class="text-xs text-slate-500 dark:text-slate-400 xl:font-medium">{stat}</span>
                                                {#if pts > 0 && isMaster}
                                                    <div class="text-[10px] text-slate-400 dark:text-slate-500">{statCost(stat, heroClass) / 1_000_000}M/pt</div>
                                                {/if}
                                            </div>
                                            <span class="block xl:inline text-lg xl:text-base font-bold {pts > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}">+{pts}</span>
                                        </div>
                                    {/each}
                                </div>
                                {#if isMaster}
                                    <div class="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded p-3 flex items-center justify-between">
                                        <span class="text-xs text-slate-500 dark:text-slate-400">EXP needed to buy</span>
                                        <span class="font-bold text-red-500 dark:text-red-400 text-sm">{(Object.entries(result.missingStats).reduce((sum, [stat, pts]) => sum + pts * statCost(stat, heroClass), 0) / 1_000_000).toLocaleString()}M</span>
                                    </div>
                                {:else}
                                    <div class="bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded p-3 flex items-center gap-2">
                                        <span class="text-amber-500 text-sm">★</span>
                                        <span class="text-xs text-slate-500 dark:text-slate-400">Purchasing additional stat points requires <span class="text-amber-500 dark:text-amber-400 font-medium">Master</span> status</span>
                                    </div>
                                {/if}
                            </div>
                        {:else}
                            <div class="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-400 dark:border-emerald-500/50 p-3 rounded text-center">
                                <span class="text-emerald-600 dark:text-emerald-400 font-medium text-sm">All targets met!</span>
                            </div>
                        {/if}


                        <!-- Final Base Stats -->
                        <div class="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                            <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Final base stats</h3>
                            <div class="grid grid-cols-5 xl:grid-cols-1 gap-1">
                                {#each Object.entries(result.finalBaseStats) as [stat, val]}
                                    <div class="xl:flex xl:items-center xl:justify-between text-center xl:text-left">
                                        <span class="block text-slate-400 dark:text-slate-500 text-xs">{stat}</span>
                                        <span class="font-bold text-slate-800 dark:text-white text-sm">{val}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <!-- Final Stats with Items -->
                        <div class="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                            <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Final stats (w/ items)</h3>
                            <div class="grid grid-cols-5 xl:grid-cols-1 gap-1">
                                {#each Object.entries(result.finalStats) as [stat, val]}
                                    <div class="xl:flex xl:items-center xl:justify-between text-center xl:text-left">
                                        <span class="block text-slate-400 dark:text-slate-500 text-xs">{stat}</span>
                                        <span class="font-bold text-slate-800 dark:text-white text-sm">{val}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>

                    </div><!-- end right column -->

                </div>
            {/if}
        </section>

    </main>
</div>

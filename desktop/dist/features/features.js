const PROGRESS_KEY = 'memory-match-adventure-progress';
const SETTINGS_KEY = 'memory-match-adventure-settings';
const CUSTOM_AUDIO_DB = 'memory-match-custom-audio';
const CUSTOM_AUDIO_STORE = 'tracks';
const CUSTOM_CARD_BACK_PREFIX = 'custom-card-back-';
const CUSTOM_CARD_BACK_PRICE = 40;

let selectedCustomCardFile = null;
let customCardPreviewUrl = null;
let shopCardPreviewUrls = [];

const featurePages = [
    ['shop', '🛍 Shop', 'Unlock card backs and buy hints with coins.'],
    ['backgrounds', '🖼️ Backgrounds', 'Adjust brightness, blur, and image position.'],
    ['themes', '🎨 Themes', 'Unlock colorful game worlds with coins.'],
    ['powerups', '⚡ Power-ups', 'Buy hints, reveals, extra time, and undo.'],
    ['rewards', '🪙 Level rewards', 'See how first-time level rewards work.'],
    ['stats', '📊 Statistics', 'Review your wins, records, moves, and play time.'],
    ['streak', '🔥 Daily streak', 'Collect your daily coins and hint.'],
    ['accessibility', '♿ Accessibility', 'Tune contrast, labels, sound, and motion.'],
    ['backup', '💾 Save backup', 'Export or restore progress and settings.'],
];

const themes = [
    { id: 'light', name: 'Classic', price: 0, description: 'The original bright look.' },
    { id: 'night', name: 'Night', price: 0, description: 'A calm dark gradient.' },
    { id: 'candy', name: 'Candy', price: 0, description: 'Sweet pink and peach colors.' },
    { id: 'ocean', name: 'Ocean', price: 60, description: 'Cool sea and aqua shades.' },
    { id: 'forest', name: 'Forest', price: 90, description: 'Fresh green nature colors.' },
    { id: 'space', name: 'Space', price: 120, description: 'A deep cosmic night sky.' },
];

const powerups = [
    { id: 'hintCredits', name: 'Hint', detail: 'Reveal a matching pair during a level.', price: 15 },
    { id: 'extraTime', name: 'Extra time', detail: 'Add 60 seconds to the current level.', price: 35 },
    { id: 'reveal', name: 'Pair reveal', detail: 'Briefly reveal one unmatched pair.', price: 25 },
    { id: 'undo', name: 'Undo a mismatch', detail: 'Restore the deck before your latest mismatch and refund that move.', price: 40 },
];

const cardBacks = [
    { id: 'classic', name: 'Classic', description: 'The original candy gradient.', price: 0 },
    { id: 'royal', name: 'Royal Amethyst', description: 'A jeweled violet card with gold geometry.', price: 45 },
    { id: 'galaxy', name: 'Stardust Galaxy', description: 'A deep cosmic field of stars.', price: 60 },
    { id: 'ocean', name: 'Ocean Waves', description: 'Layered aqua waves with a deep-sea glow.', price: 75 },
    { id: 'neon', name: 'Neon Circuit', description: 'Electric cyan lines over a neon night.', price: 90 },
    { id: 'ember', name: 'Ember Crown', description: 'A warm flame-lit crimson design.', price: 110 },
];

function openCustomCardBackDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CUSTOM_AUDIO_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(CUSTOM_AUDIO_STORE)) {
                request.result.createObjectStore(CUSTOM_AUDIO_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open custom card storage.'));
    });
}

async function readCustomCardBacks() {
    const database = await openCustomCardBackDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readonly');
            const request = transaction.objectStore(CUSTOM_AUDIO_STORE).getAll();
            request.onsuccess = () => resolve(request.result.filter(item =>
                item?.type === 'custom-card-back'
                && typeof item.id === 'string'
                && item.id.startsWith('custom-')
                && item.file instanceof Blob));
            request.onerror = () => reject(request.error || new Error('Could not load custom card designs.'));
        });
    } finally {
        database.close();
    }
}

async function storeCustomCardBack(cardBack) {
    const database = await openCustomCardBackDatabase();
    try {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readwrite');
            transaction.objectStore(CUSTOM_AUDIO_STORE).put(cardBack, `${CUSTOM_CARD_BACK_PREFIX}${cardBack.id}`);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not save this card design.'));
            transaction.onabort = () => reject(transaction.error || new Error('Saving this card design was cancelled.'));
        });
    } finally {
        database.close();
    }
}

async function deleteCustomCardBack(id) {
    const database = await openCustomCardBackDatabase();
    try {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readwrite');
            transaction.objectStore(CUSTOM_AUDIO_STORE).delete(`${CUSTOM_CARD_BACK_PREFIX}${id}`);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not roll back the card design.'));
            transaction.onabort = () => reject(transaction.error || new Error('Removing the unsaved card design was cancelled.'));
        });
    } finally {
        database.close();
    }
}

function readStored(key) {
    const value = localStorage.getItem(key);
    if (!value) return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Saved ${key === PROGRESS_KEY ? 'progress' : 'settings'} data is invalid.`);
    }
    return parsed;
}

let progress;
let settings;
try {
    progress = readStored(PROGRESS_KEY);
    settings = readStored(SETTINGS_KEY);
} catch (error) {
    console.error('Could not read saved game data for this feature page.', error);
    const status = document.querySelector('.feature-status');
    if (status) {
        status.textContent = 'Could not read saved game data. Return to the game and check browser storage.';
        status.dataset.error = 'true';
    }
    progress = {};
    settings = {};
}

progress.coins = Number.isSafeInteger(progress.coins) ? Math.max(0, progress.coins) : 0;
progress.unlockedThemes = Array.isArray(progress.unlockedThemes)
    ? [...new Set(['light', 'night', 'candy', ...progress.unlockedThemes.filter(theme => themes.some(item => item.id === theme))])]
    : ['light', 'night', 'candy'];
progress.unlockedCardBacks = Array.isArray(progress.unlockedCardBacks)
    ? [...new Set(['classic', ...progress.unlockedCardBacks.filter(id => cardBacks.some(item => item.id === id))])]
    : ['classic'];
progress.selectedCardBack = progress.unlockedCardBacks.includes(progress.selectedCardBack)
    ? progress.selectedCardBack : 'classic';
progress.powerups = Object.fromEntries(powerups.map(item => [
    item.id,
    item.id === 'hintCredits'
        ? (Number.isInteger(progress.hintCredits) ? Math.max(0, progress.hintCredits) : 0)
        : (Number.isInteger(progress.powerups?.[item.id]) ? Math.max(0, progress.powerups[item.id]) : 0),
]));
progress.hintCredits = progress.powerups.hintCredits;
progress.stats = {
    totalWins: Number.isSafeInteger(progress.stats?.totalWins) ? Math.max(0, progress.stats.totalWins) : 0,
    totalMoves: Number.isSafeInteger(progress.stats?.totalMoves) ? Math.max(0, progress.stats.totalMoves) : 0,
    totalPlayTime: Number.isSafeInteger(progress.stats?.totalPlayTime) ? Math.max(0, progress.stats.totalPlayTime) : 0,
    bestTime: Number.isInteger(progress.stats?.bestTime) && progress.stats.bestTime > 0 ? progress.stats.bestTime : null,
};
progress.dailyStreak = {
    lastLoginDate: typeof progress.dailyStreak?.lastLoginDate === 'string' ? progress.dailyStreak.lastLoginDate : '',
    rewardDate: typeof progress.dailyStreak?.rewardDate === 'string' ? progress.dailyStreak.rewardDate : '',
    days: Number.isInteger(progress.dailyStreak?.days) ? Math.max(0, progress.dailyStreak.days) : 0,
};
settings = {
    sound: settings.sound !== false,
    music: settings.music === true,
    animations: settings.animations !== false,
    theme: themes.some(item => item.id === settings.theme) ? settings.theme : 'light',
    highContrast: settings.highContrast === true,
    cardNames: settings.cardNames === true,
    backgroundBrightness: Number.isFinite(settings.backgroundBrightness)
        ? Math.min(1.2, Math.max(0.4, settings.backgroundBrightness)) : 0.88,
    backgroundBlur: Number.isFinite(settings.backgroundBlur)
        ? Math.min(8, Math.max(0, settings.backgroundBlur)) : 0,
    backgroundPosition: ['center', 'top', 'bottom'].includes(settings.backgroundPosition)
        ? settings.backgroundPosition : 'center',
};

function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setStatus(id, message, isError = false) {
    const status = document.getElementById(id);
    if (!status) return;
    status.textContent = message;
    status.dataset.error = String(isError);
}

function addFeatureLinks() {
    const list = document.getElementById('feature-links');
    featurePages.forEach(([page, title, detail]) => {
        const link = document.createElement('a');
        link.className = 'feature-link';
        link.href = `${page}.html`;
        const heading = document.createElement('strong');
        heading.textContent = title;
        const description = document.createElement('span');
        description.textContent = detail;
        link.append(heading, description);
        list.appendChild(link);
    });
}

function addThemeOptions() {
    document.getElementById('theme-coins').textContent = progress.coins;
    const container = document.getElementById('theme-options');
    themes.forEach(theme => {
        const unlocked = progress.unlockedThemes.includes(theme.id);
        const option = document.createElement('article');
        option.className = 'feature-option';
        const title = document.createElement('strong');
        title.textContent = theme.name;
        const detail = document.createElement('p');
        detail.textContent = `${theme.description} ${unlocked ? 'Unlocked.' : `Costs ${theme.price} coins.`}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = unlocked
            ? (settings.theme === theme.id ? 'Selected' : 'Use theme')
            : 'Unlock';
        button.disabled = settings.theme === theme.id;
        button.addEventListener('click', () => {
            const previousCoins = progress.coins;
            const previousThemes = [...progress.unlockedThemes];
            const previousTheme = settings.theme;
            if (!progress.unlockedThemes.includes(theme.id)) {
                if (progress.coins < theme.price) {
                    setStatus('theme-status', `You need ${theme.price - progress.coins} more coins.`, true);
                    return;
                }
                progress.coins -= theme.price;
                progress.unlockedThemes.push(theme.id);
            }
            settings.theme = theme.id;
            try {
                saveProgress();
                saveSettings();
                setStatus('theme-status', `${theme.name} theme saved. Return to the game to see it.`);
                addThemeOptions();
            } catch (error) {
                progress.coins = previousCoins;
                progress.unlockedThemes = previousThemes;
                settings.theme = previousTheme;
                console.error('Could not save the selected theme.', error);
                setStatus('theme-status', 'Could not save this theme. Check browser storage and try again.', true);
            }
        });
        option.append(title, detail, button);
        container.appendChild(option);
    });
}

function addPowerupOptions() {
    document.getElementById('powerup-coins').textContent = progress.coins;
    const container = document.getElementById('powerup-shop');
    powerups.forEach(item => {
        const option = document.createElement('article');
        option.className = 'feature-option';
        const owned = item.id === 'hintCredits' ? progress.hintCredits : progress.powerups[item.id];
        const title = document.createElement('strong');
        title.textContent = `${item.name} · ${owned} owned`;
        const detail = document.createElement('p');
        detail.textContent = `${item.detail} Price: ${item.price} coins.`;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Buy';
        button.addEventListener('click', () => {
            if (progress.coins < item.price) {
                setStatus('powerup-status', `You need ${item.price - progress.coins} more coins.`, true);
                return;
            }
            const previousCoins = progress.coins;
            const previousHints = progress.hintCredits;
            const previousCount = progress.powerups[item.id];
            progress.coins -= item.price;
            if (item.id === 'hintCredits') progress.hintCredits++;
            else progress.powerups[item.id]++;
            try {
                saveProgress();
                setStatus('powerup-status', `${item.name} purchased. Start or continue a level to use it.`);
                container.replaceChildren();
                addPowerupOptions();
            } catch (error) {
                progress.coins = previousCoins;
                progress.hintCredits = previousHints;
                progress.powerups[item.id] = previousCount;
                console.error('Could not save the purchased power-up.', error);
                setStatus('powerup-status', 'Could not save this purchase. Check browser storage and try again.', true);
            }
        });
        option.append(title, detail, button);
        container.appendChild(option);
    });
}

function renderShop() {
    void renderShopContents();
}

async function renderShopContents() {
    const designs = document.getElementById('card-back-shop');
    document.getElementById('shop-coins').textContent = progress.coins;
    document.getElementById('shop-hints').textContent = progress.hintCredits;
    document.getElementById('shop-hints-top').textContent = progress.hintCredits;
    designs.replaceChildren();
    shopCardPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    shopCardPreviewUrls = [];

    let savedCustomCardBacks = [];
    try {
        savedCustomCardBacks = await readCustomCardBacks();
    } catch (error) {
        console.error('Could not load saved custom card designs.', error);
        setStatus('shop-status', 'Could not load your saved custom designs. Check browser storage and reload the shop.', true);
    }

    const allDesigns = [
        ...cardBacks.map(item => ({ ...item, isCustom: false })),
        ...savedCustomCardBacks.map(item => ({
            ...item,
            description: 'Your own image, saved on this device.',
            price: 0,
            isCustom: true,
        })),
    ];
    allDesigns.forEach(item => {
        const unlocked = progress.unlockedCardBacks.includes(item.id);
        const article = document.createElement('article');
        const isEquipped = progress.selectedCardBack === item.id;
        article.className = `card-shop-item${isEquipped ? ' is-equipped' : ''}`;
        const preview = document.createElement('div');
        preview.className = `card-back-preview${item.isCustom ? ' custom-saved-card-preview' : ''}`;
        if (item.isCustom) {
            const objectUrl = URL.createObjectURL(item.file);
            shopCardPreviewUrls.push(objectUrl);
            preview.style.backgroundImage = `url("${objectUrl}")`;
            preview.style.backgroundPosition = 'center';
            preview.style.backgroundSize = 'cover';
        } else {
            preview.dataset.skin = item.id;
        }
        preview.setAttribute('aria-hidden', 'true');
        const title = document.createElement('h2');
        title.textContent = item.name;
        const description = document.createElement('p');
        description.textContent = item.description;
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = isEquipped;
        button.textContent = button.disabled
            ? 'Equipped'
            : (unlocked ? 'Equip design' : `Unlock · ${item.price} coins`);
        button.addEventListener('click', () => {
            const previousCoins = progress.coins;
            const previousUnlocked = [...progress.unlockedCardBacks];
            const previousSelection = progress.selectedCardBack;
            if (!progress.unlockedCardBacks.includes(item.id)) {
                if (progress.coins < item.price) {
                    setStatus('shop-status', `You need ${item.price - progress.coins} more coins for this design.`, true);
                    return;
                }
                progress.coins -= item.price;
                progress.unlockedCardBacks.push(item.id);
            }
            progress.selectedCardBack = item.id;
            try {
                saveProgress();
                setStatus('shop-status', `${item.name} unlocked and equipped.`);
                renderShop();
            } catch (error) {
                progress.coins = previousCoins;
                progress.unlockedCardBacks = previousUnlocked;
                progress.selectedCardBack = previousSelection;
                console.error('Could not save the card back purchase.', error);
                setStatus('shop-status', 'Could not save this card design. Check browser storage and try again.', true);
            }
        });
        article.append(preview, title, description, button);
        designs.appendChild(article);
    });

    document.getElementById('buy-hint-button').addEventListener('click', buyShopHint, { once: true });
}

function setupCustomCardBackUpload() {
    const input = document.getElementById('custom-card-file');
    const previewWrap = document.getElementById('custom-card-preview-wrap');
    const preview = document.getElementById('custom-card-preview');
    const buyButton = document.getElementById('buy-custom-card-button');
    input.addEventListener('change', event => {
        const [file] = event.target.files || [];
        event.target.value = '';
        selectedCustomCardFile = null;
        buyButton.disabled = true;
        if (customCardPreviewUrl) URL.revokeObjectURL(customCardPreviewUrl);
        customCardPreviewUrl = null;
        if (!file) {
            previewWrap.hidden = true;
            return;
        }
        const supportedImage = /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)
            && (!file.type || file.type.startsWith('image/'));
        if (!supportedImage) {
            previewWrap.hidden = true;
            setStatus('shop-status', 'Choose a PNG, JPG, WEBP, GIF, AVIF, or BMP image.', true);
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            previewWrap.hidden = true;
            setStatus('shop-status', 'This image is larger than 8 MB. Choose a smaller image.', true);
            return;
        }
        selectedCustomCardFile = file;
        customCardPreviewUrl = URL.createObjectURL(file);
        preview.style.backgroundImage = `url("${customCardPreviewUrl}")`;
        document.getElementById('custom-card-name').textContent = file.name;
        previewWrap.hidden = false;
        buyButton.disabled = false;
        setStatus('shop-status', 'Preview looks good. Unlock it with 40 coins to add it to your card collection.');
    });

    buyButton.addEventListener('click', async () => {
        if (!selectedCustomCardFile) return;
        if (progress.coins < CUSTOM_CARD_BACK_PRICE) {
            setStatus('shop-status', `You need ${CUSTOM_CARD_BACK_PRICE - progress.coins} more coins for your custom design.`, true);
            return;
        }

        const file = selectedCustomCardFile;
        const id = `custom-${globalThis.crypto?.randomUUID?.()
            || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        const cardBack = { type: 'custom-card-back', id, name: file.name, file };
        const previousCoins = progress.coins;
        const previousUnlocked = [...progress.unlockedCardBacks];
        const previousSelected = progress.selectedCardBack;
        buyButton.disabled = true;
        try {
            await storeCustomCardBack(cardBack);
            progress.coins -= CUSTOM_CARD_BACK_PRICE;
            progress.unlockedCardBacks.push(id);
            progress.selectedCardBack = id;
            saveProgress();
            selectedCustomCardFile = null;
            previewWrap.hidden = true;
            if (customCardPreviewUrl) URL.revokeObjectURL(customCardPreviewUrl);
            customCardPreviewUrl = null;
            setStatus('shop-status', `${file.name} unlocked and equipped as your card back.`);
            renderShop();
        } catch (error) {
            progress.coins = previousCoins;
            progress.unlockedCardBacks = previousUnlocked;
            progress.selectedCardBack = previousSelected;
            try {
                await deleteCustomCardBack(id);
            } catch (rollbackError) {
                console.error('Could not remove a card design after a failed purchase.', rollbackError);
            }
            console.error('Could not save the custom card design purchase.', error);
            setStatus('shop-status', 'Could not save this design. Check device storage and try again.', true);
            buyButton.disabled = false;
        }
    });
}

function buyShopHint() {
    const price = 15;
    if (progress.coins < price) {
        setStatus('shop-status', `You need ${price - progress.coins} more coins to buy a hint.`, true);
        document.getElementById('buy-hint-button').addEventListener('click', buyShopHint, { once: true });
        return;
    }
    const previousCoins = progress.coins;
    const previousHints = progress.hintCredits;
    progress.coins -= price;
    progress.hintCredits++;
    try {
        saveProgress();
        setStatus('shop-status', 'Hint purchased and added to your game inventory.');
        renderShop();
    } catch (error) {
        progress.coins = previousCoins;
        progress.hintCredits = previousHints;
        console.error('Could not save the hint purchase.', error);
        setStatus('shop-status', 'Could not save this hint. Check browser storage and try again.', true);
        document.getElementById('buy-hint-button').addEventListener('click', buyShopHint, { once: true });
    }
}

function renderStats() {
    const stats = [
        ['Completed levels', Array.isArray(progress.completedLevels) ? progress.completedLevels.length : 0],
        ['Total wins', progress.stats.totalWins],
        ['Best time', progress.stats.bestTime === null ? '—' : formatTime(progress.stats.bestTime)],
        ['Total play time', formatTime(progress.stats.totalPlayTime)],
        ['Average moves per win', progress.stats.totalWins
            ? Math.round(progress.stats.totalMoves / progress.stats.totalWins) : '—'],
        ['Stars collected', Object.values(progress.bestStars || {}).reduce((sum, stars) => sum + stars, 0)],
    ];
    const container = document.getElementById('stats-grid');
    stats.forEach(([label, value]) => {
        const item = document.createElement('article');
        item.className = 'feature-stat';
        const name = document.createElement('span');
        name.textContent = label;
        const result = document.createElement('strong');
        result.textContent = value;
        item.append(name, result);
        container.appendChild(item);
    });
}

function formatTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function renderStreak() {
    const container = document.getElementById('streak-summary');
    const number = document.createElement('strong');
    number.textContent = `🔥 ${progress.dailyStreak.days}`;
    const label = document.createElement('span');
    label.textContent = progress.dailyStreak.days === 1 ? 'day streak' : 'day streak';
    const reward = document.createElement('span');
    reward.textContent = progress.dailyStreak.rewardDate === getLocalDateKey()
        ? 'Today’s 5 coins and hint are collected.' : 'Open the main game to collect today’s reward.';
    container.append(number, label, reward);
}

function getLocalDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function setupBackgroundControls() {
    const brightness = document.getElementById('background-brightness');
    const blur = document.getElementById('background-blur');
    const position = document.getElementById('background-position');
    brightness.value = settings.backgroundBrightness;
    blur.value = settings.backgroundBlur;
    position.value = settings.backgroundPosition;
    const updateLabels = () => {
        document.getElementById('brightness-value').textContent = `${Math.round(Number(brightness.value) * 100)}%`;
        document.getElementById('blur-value').textContent = `${blur.value} px`;
    };
    const save = () => {
        settings.backgroundBrightness = Number(brightness.value);
        settings.backgroundBlur = Number(blur.value);
        settings.backgroundPosition = position.value;
        try {
            saveSettings();
            updateLabels();
            setStatus('background-status', 'Background preferences saved on this device.');
        } catch (error) {
            console.error('Could not save background preferences.', error);
            setStatus('background-status', 'Could not save these settings. Check browser storage.', true);
        }
    };
    [brightness, blur, position].forEach(control => control.addEventListener('input', save));
    position.addEventListener('change', save);
    updateLabels();
}

function setupAccessibility() {
    const controls = [
        ['access-sound', 'sound'],
        ['access-music', 'music'],
        ['access-animations', 'animations'],
        ['access-contrast', 'highContrast'],
        ['access-card-names', 'cardNames'],
    ];
    controls.forEach(([id, property]) => {
        const control = document.getElementById(id);
        control.checked = settings[property];
        control.addEventListener('change', () => {
            settings[property] = control.checked;
            try {
                saveSettings();
                setStatus('accessibility-status', 'Accessibility preferences saved. Return to the game to apply them.');
            } catch (error) {
                console.error('Could not save accessibility preferences.', error);
                setStatus('accessibility-status', 'Could not save this preference. Check browser storage.', true);
            }
        });
    });
}

function setupBackup() {
    document.getElementById('export-backup').addEventListener('click', () => {
        try {
            const backup = {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                progress: readStored(PROGRESS_KEY),
                settings: readStored(SETTINGS_KEY),
            };
            const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = `memory-match-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
            setStatus('backup-status', 'Backup downloaded. Keep it somewhere safe.');
        } catch (error) {
            console.error('Could not export the game backup.', error);
            setStatus('backup-status', 'Could not create a backup. Check browser storage and try again.', true);
        }
    });
    document.getElementById('import-backup').addEventListener('change', async event => {
        const [file] = event.target.files || [];
        event.target.value = '';
        if (!file) return;
        if (file.size > 2_000_000) {
            setStatus('backup-status', 'Backup file is too large (maximum 2 MB).', true);
            return;
        }
        try {
            const backup = JSON.parse(await file.text());
            if (backup?.schemaVersion !== 1
                || !backup.progress || typeof backup.progress !== 'object' || Array.isArray(backup.progress)
                || !Array.isArray(backup.progress.completedLevels)
                || !backup.settings || typeof backup.settings !== 'object' || Array.isArray(backup.settings)) {
                throw new Error('This file is not a supported Memory Match backup.');
            }
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(backup.progress));
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
            setStatus('backup-status', 'Backup restored. Returning to the game to load it.');
            setTimeout(() => { window.location.href = '../memory%20match%20copy.html'; }, 900);
        } catch (error) {
            console.error('Could not import the game backup.', error);
            setStatus('backup-status', error instanceof SyntaxError
                ? 'This file is not valid JSON.' : (error.message || 'Could not restore this backup.'), true);
        }
    });
}

switch (document.body.dataset.feature) {
    case 'index':
        addFeatureLinks();
        break;
    case 'backgrounds':
        setupBackgroundControls();
        break;
    case 'themes':
        addThemeOptions();
        break;
    case 'powerups':
        addPowerupOptions();
        break;
    case 'shop':
        setupCustomCardBackUpload();
        renderShop();
        break;
    case 'rewards':
        [
            ['Coins available', progress.coins],
            ['Levels completed', Array.isArray(progress.completedLevels) ? progress.completedLevels.length : 0],
            ['Themes unlocked', progress.unlockedThemes.length],
            ['Power-ups owned', Object.values(progress.powerups).reduce((sum, count) => sum + count, 0)],
        ].forEach(([label, value]) => {
            const card = document.createElement('article');
            card.className = 'feature-stat';
            const name = document.createElement('span');
            name.textContent = label;
            const amount = document.createElement('strong');
            amount.textContent = value;
            card.append(name, amount);
            document.getElementById('reward-summary').appendChild(card);
        });
        break;
    case 'stats':
        renderStats();
        break;
    case 'streak':
        renderStreak();
        break;
    case 'accessibility':
        setupAccessibility();
        break;
    case 'backup':
        setupBackup();
        break;
    default:
        console.error(`Unknown feature page: ${document.body.dataset.feature}`);
}

window.addEventListener('pagehide', () => {
    if (customCardPreviewUrl) URL.revokeObjectURL(customCardPreviewUrl);
    shopCardPreviewUrls.forEach(url => URL.revokeObjectURL(url));
});

/*
 * Memory Match Adventure — browser application module.
 * Owns game state, persistence, UI events, audio, and gameplay rendering.
 */

        /* ============================
           Audio System
           ============================ */
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        let audioCtx = null;
        const audioPreferences = { sound: true, music: false };
        let musicNodes = [];
        let customMusicObjectUrl = null;
        let customMusicPlaylist = [];
        let selectedMusicFiles = [];
        let currentMusicIndex = -1;
        let selectedBackgroundFile = null;
        let customBackgroundObjectUrl = null;
        let backgroundPreviewUrls = [];

        const CUSTOM_AUDIO_DB = 'memory-match-custom-audio';
        const CUSTOM_AUDIO_STORE = 'tracks';
        const CUSTOM_AUDIO_KEY = 'playlist';
        const LEGACY_CUSTOM_AUDIO_KEY = 'background-music';
        const CUSTOM_BACKGROUND_KEY = 'custom-background';
        const CUSTOM_CARD_BACK_PREFIX = 'custom-card-back-';

        function openCustomAudioDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(CUSTOM_AUDIO_DB, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(CUSTOM_AUDIO_STORE)) {
                        request.result.createObjectStore(CUSTOM_AUDIO_STORE);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Could not open custom audio storage.'));
            });
        }

        async function storeCustomMusic(playlist) {
            const database = await openCustomAudioDatabase();
            try {
                await new Promise((resolve, reject) => {
                    const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readwrite');
                    const store = transaction.objectStore(CUSTOM_AUDIO_STORE);
                    store.put(playlist, CUSTOM_AUDIO_KEY);
                    store.delete(LEGACY_CUSTOM_AUDIO_KEY);
                    transaction.oncomplete = resolve;
                    transaction.onerror = () => reject(transaction.error || new Error('Could not save the MP3 playlist.'));
                    transaction.onabort = () => reject(transaction.error || new Error('Saving the MP3 playlist was cancelled.'));
                });
            } finally {
                database.close();
            }
        }

        async function readCustomMusic() {
            const database = await openCustomAudioDatabase();
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readonly');
                    const store = transaction.objectStore(CUSTOM_AUDIO_STORE);
                    const request = store.get(CUSTOM_AUDIO_KEY);
                    request.onsuccess = () => {
                        if (Array.isArray(request.result)) {
                            resolve(request.result.filter(track => track?.file instanceof Blob));
                            return;
                        }
                        const legacyRequest = store.get(LEGACY_CUSTOM_AUDIO_KEY);
                        legacyRequest.onsuccess = () => {
                            const legacyTrack = legacyRequest.result;
                            resolve(legacyTrack?.file instanceof Blob
                                ? [{ id: 'legacy-background-music', file: legacyTrack.file, name: legacyTrack.name || 'Saved MP3' }]
                                : []);
                        };
                        legacyRequest.onerror = () => reject(
                            legacyRequest.error || new Error('Could not read the saved MP3 playlist.'),
                        );
                    };
                    request.onerror = () => reject(request.error || new Error('Could not read the saved MP3 playlist.'));
                });
            } finally {
                database.close();
            }
        }

        async function storeCustomBackground(file) {
            const database = await openCustomAudioDatabase();
            try {
                await new Promise((resolve, reject) => {
                    const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readwrite');
                    transaction.objectStore(CUSTOM_AUDIO_STORE).put(
                        file ? { file, name: file.name } : null,
                        CUSTOM_BACKGROUND_KEY,
                    );
                    transaction.oncomplete = resolve;
                    transaction.onerror = () => reject(transaction.error || new Error('Could not save the custom background.'));
                    transaction.onabort = () => reject(transaction.error || new Error('Saving the custom background was cancelled.'));
                });
            } finally {
                database.close();
            }
        }

        async function readCustomBackground() {
            const database = await openCustomAudioDatabase();
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readonly');
                    const request = transaction.objectStore(CUSTOM_AUDIO_STORE).get(CUSTOM_BACKGROUND_KEY);
                    request.onsuccess = () => resolve(request.result?.file instanceof Blob ? request.result : null);
                    request.onerror = () => reject(request.error || new Error('Could not read the saved custom background.'));
                });
            } finally {
                database.close();
            }
        }

        async function readCustomCardBack(id) {
            const database = await openCustomAudioDatabase();
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = database.transaction(CUSTOM_AUDIO_STORE, 'readonly');
                    const request = transaction.objectStore(CUSTOM_AUDIO_STORE).get(`${CUSTOM_CARD_BACK_PREFIX}${id}`);
                    request.onsuccess = () => resolve(
                        request.result?.type === 'custom-card-back'
                            && request.result.id === id
                            && request.result.file instanceof Blob
                            ? request.result : null,
                    );
                    request.onerror = () => reject(request.error || new Error('Could not read the saved card design.'));
                });
            } finally {
                database.close();
            }
        }

        async function restoreSelectedCardBack() {
            if (!progress.selectedCardBack.startsWith('custom-')) return;
            try {
                const cardBack = await readCustomCardBack(progress.selectedCardBack);
                if (!cardBack) throw new Error('The selected custom card design is missing.');
                document.body.style.setProperty(
                    '--custom-card-back-image',
                    `url("${URL.createObjectURL(cardBack.file)}")`,
                );
                document.body.dataset.cardBack = cardBack.id;
            } catch (error) {
                console.warn('Could not restore the selected custom card design.', error);
                progress.selectedCardBack = 'classic';
                document.body.dataset.cardBack = 'classic';
                saveProgress();
            }
        }

        function applyCustomBackground(file, name) {
            if (customBackgroundObjectUrl) URL.revokeObjectURL(customBackgroundObjectUrl);
            customBackgroundObjectUrl = URL.createObjectURL(file);
            document.body.style.setProperty('--custom-background-image', `url("${customBackgroundObjectUrl}")`);
            document.body.style.setProperty('--custom-background-brightness', settings.backgroundBrightness);
            document.body.style.setProperty('--custom-background-blur', `${settings.backgroundBlur}px`);
            document.body.style.setProperty('--custom-background-position', settings.backgroundPosition);
            document.body.dataset.customBackground = 'true';
            document.getElementById('custom-background-status').textContent = `Background applied: ${name}`;
            document.getElementById('remove-custom-background').disabled = false;
        }

        async function restoreCustomBackground() {
            try {
                const savedBackground = await readCustomBackground();
                if (savedBackground) applyCustomBackground(savedBackground.file, savedBackground.name || 'Saved image');
            } catch (error) {
                console.warn('Could not restore the saved custom background.', error);
                document.getElementById('custom-background-status').textContent =
                    'Could not load the saved background. You can choose the image again from this device.';
            }
        }

        function clearBackgroundPreviewUrls() {
            backgroundPreviewUrls.forEach(url => URL.revokeObjectURL(url));
            backgroundPreviewUrls = [];
        }

        function renderBackgroundChoices(files) {
            const choices = document.getElementById('custom-background-choices');
            clearBackgroundPreviewUrls();
            choices.replaceChildren();
            selectedBackgroundFile = null;
            const addButton = document.getElementById('add-custom-background');
            addButton.disabled = true;
            files.forEach(file => {
                const imageUrl = URL.createObjectURL(file);
                backgroundPreviewUrls.push(imageUrl);
                const button = document.createElement('button');
                button.className = 'custom-background-choice';
                button.type = 'button';
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', `Select ${file.name}`);
                const image = document.createElement('img');
                image.src = imageUrl;
                image.alt = '';
                image.loading = 'lazy';
                const name = document.createElement('span');
                name.textContent = file.name;
                button.append(image, name);
                button.addEventListener('click', () => {
                    selectedBackgroundFile = file;
                    choices.querySelectorAll('.custom-background-choice')
                        .forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
                    document.getElementById('custom-background-selection').textContent =
                        `${file.name} selected. Click Add Background to apply it.`;
                    addButton.disabled = false;
                });
                choices.appendChild(button);
            });
        }

        function applyAccessibilitySettings() {
            document.body.dataset.highContrast = settings.highContrast ? 'true' : 'false';
            document.body.dataset.cardNames = settings.cardNames ? 'true' : 'false';
        }

        function setCustomMusic(trackIndex, autoplay = true) {
            const player = document.getElementById('custom-music-player');
            const track = customMusicPlaylist[trackIndex];
            if (!track) return;
            if (customMusicObjectUrl) URL.revokeObjectURL(customMusicObjectUrl);
            customMusicObjectUrl = URL.createObjectURL(track.file);
            currentMusicIndex = trackIndex;
            player.src = customMusicObjectUrl;
            player.loop = false;
            player.hidden = false;
            player.load();
            document.getElementById('custom-audio-status').textContent = `Playing: ${track.name}`;
            document.getElementById('remove-custom-audio').disabled = false;
            renderCustomMusicPlaylist();
            if (autoplay) {
                player.play().catch(error => {
                    console.warn('The selected MP3 could not be played.', error);
                    setCustomAudioStatus('Press Play on the audio player to start this track.');
                });
            }
        }

        function renderCustomMusicPlaylist() {
            const playlist = document.getElementById('custom-audio-playlist');
            playlist.replaceChildren();
            customMusicPlaylist.forEach((track, index) => {
                const item = document.createElement('li');
                const playButton = document.createElement('button');
                playButton.className = 'custom-audio-track';
                playButton.type = 'button';
                playButton.textContent = `${index === currentMusicIndex ? '▶ ' : ''}${track.name}`;
                playButton.setAttribute('aria-current', index === currentMusicIndex ? 'true' : 'false');
                playButton.addEventListener('click', () => setCustomMusic(index));

                const removeButton = document.createElement('button');
                removeButton.className = 'custom-audio-track-remove';
                removeButton.type = 'button';
                removeButton.textContent = 'Remove';
                removeButton.setAttribute('aria-label', `Remove ${track.name}`);
                removeButton.addEventListener('click', () => removeCustomMusicTrack(index));

                item.append(playButton, removeButton);
                playlist.appendChild(item);
            });
            document.getElementById('remove-custom-audio').disabled = customMusicPlaylist.length === 0;
            if (customMusicPlaylist.length === 0) {
                document.getElementById('custom-music-player').pause();
                document.getElementById('custom-music-player').hidden = true;
                setCustomAudioStatus('Your playlist is empty.');
            }
        }

        async function removeCustomMusicTrack(trackIndex) {
            const previousPlaylist = [...customMusicPlaylist];
            const removedCurrentTrack = trackIndex === currentMusicIndex;
            const nextCurrentIndex = currentMusicIndex > trackIndex ? currentMusicIndex - 1 : currentMusicIndex;
            customMusicPlaylist.splice(trackIndex, 1);
            try {
                await storeCustomMusic(customMusicPlaylist);
                if (removedCurrentTrack) {
                    const player = document.getElementById('custom-music-player');
                    player.pause();
                    player.removeAttribute('src');
                    player.load();
                    if (customMusicObjectUrl) URL.revokeObjectURL(customMusicObjectUrl);
                    customMusicObjectUrl = null;
                    currentMusicIndex = -1;
                    if (audioPreferences.music && customMusicPlaylist.length) {
                        setCustomMusic(Math.min(trackIndex, customMusicPlaylist.length - 1));
                    }
                } else {
                    currentMusicIndex = nextCurrentIndex;
                }
                renderCustomMusicPlaylist();
            } catch (error) {
                console.warn('Could not remove the selected MP3.', error);
                setCustomAudioStatus('Could not remove this MP3. Please try again.');
                customMusicPlaylist = previousPlaylist;
                renderCustomMusicPlaylist();
            }
        }

        async function restoreCustomMusic() {
            try {
                customMusicPlaylist = await readCustomMusic();
                renderCustomMusicPlaylist();
                if (audioPreferences.music && !gameScreen.classList.contains('hidden')) {
                    setMusicEnabled(true);
                }
            } catch (error) {
                console.warn('Could not restore your saved MP3 playlist.', error);
                document.getElementById('custom-audio-status').textContent =
                    'Could not load the saved playlist. You can add the tracks again from this device.';
            }
        }

        function stopMusicOscillators() {
            musicNodes.forEach(node => {
                try { node.stop(); } catch (error) { console.warn('Music oscillator could not be stopped.', error); }
            });
            musicNodes = [];
        }

        function setCustomAudioStatus(message) {
            document.getElementById('custom-audio-status').textContent = message;
        }

        function ensureAudio() {
            if (!AudioCtx) return null;
            if (!audioCtx) {
                try {
                    audioCtx = new AudioCtx();
                } catch (error) {
                    console.warn('Audio is unavailable in this browser.', error);
                    return null;
                }
            }
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(error => console.warn('Audio could not be resumed.', error));
            return audioCtx;
        }

        function playTone(freq, duration, type = 'sine', vol = 0.25, delay = 0) {
            if (!audioPreferences.sound) return;
            const context = ensureAudio();
            if (!context) return;
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            osc.type = type;
            osc.frequency.value = freq;
            const t = context.currentTime + delay;
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
            osc.start(t);
            osc.stop(t + duration);
        }

        function setMusicEnabled(enabled) {
            audioPreferences.music = enabled;
            const customPlayer = document.getElementById('custom-music-player');

            if (!enabled) {
                customPlayer.pause();
                stopMusicOscillators();
                return;
            }

            if (customMusicPlaylist.length) {
                stopMusicOscillators();
                if (currentMusicIndex < 0) {
                    setCustomMusic(0);
                    return;
                }
                if (customPlayer.paused) {
                    customPlayer.play().catch(error => {
                        console.warn('Custom background music could not be played.', error);
                        document.getElementById('custom-audio-status').textContent =
                            'Press Play on the MP3 player to allow audio, then start the game.';
                    });
                }
                return;
            }

            if (!ensureAudio()) return;
            if (musicNodes.length) return;
            [261.63, 392].forEach((frequency, index) => {
                const oscillator = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                oscillator.type = index === 0 ? 'sine' : 'triangle';
                oscillator.frequency.value = frequency;
                gain.gain.value = 0.012;
                oscillator.connect(gain);
                gain.connect(audioCtx.destination);
                oscillator.start();
                musicNodes.push(oscillator);
            });
        }

        function playFlipSound() {
            playTone(880, 0.08, 'sine', 0.2);
            playTone(1100, 0.06, 'sine', 0.1, 0.03);
        }

        function playMatchSound() {
            playTone(660, 0.15, 'triangle', 0.25);
            playTone(880, 0.15, 'triangle', 0.25, 0.12);
            playTone(1100, 0.25, 'triangle', 0.2, 0.24);
        }

        function playMismatchSound() {
            playTone(300, 0.18, 'sawtooth', 0.1);
            playTone(250, 0.2, 'sawtooth', 0.08, 0.1);
        }

        function playWinSound() {
            const notes = [523, 659, 784, 880, 1047, 1047, 1319];
            notes.forEach((f, i) => {
                playTone(f, i < 5 ? 0.2 : 0.4, 'triangle', 0.2, i * 0.1);
            });
        }

        function playComboSound(comboLevel) {
            const baseFreq = 800 + comboLevel * 100;
            playTone(baseFreq, 0.1, 'sine', 0.2);
            playTone(baseFreq + 200, 0.15, 'sine', 0.2, 0.08);
        }

        /* ============================
           Card Icons
           ============================ */
        const CARD_ICONS = [
           { emoji: '🐱', bg: '#FF80AB', name: 'Cat' },
  { emoji: '🐶', bg: '#FFB74D', name: 'Dog' },
  { emoji: '🦁', bg: '#FFE082', name: 'Lion' },
  { emoji: '🐯', bg: '#FFB74D', name: 'Tiger' },
  { emoji: '🦊', bg: '#FF8A65', name: 'Fox' },
  { emoji: '🐼', bg: '#CFD8DC', name: 'Panda' },
  { emoji: 'koala', emoji: '🐨', bg: '#B0BEC5', name: 'Koala' },
  { emoji: '🐰', bg: '#F8BBD0', name: 'Rabbit' },
  { emoji: '🐻', bg: '#A1887F', name: 'Bear' },
  { emoji: '🐸', bg: '#A5D6A7', name: 'Frog' },
  { emoji: '🐵', bg: '#D7CCC8', name: 'Monkey' },
  { emoji: '🦄', bg: '#E1BEE7', name: 'Unicorn' },
  { emoji: 'OWL', emoji: '🦉', bg: '#BCAAA4', name: 'Owl' },
  { emoji: '🦋', bg: '#80DEEA', name: 'Butterfly' },
  { emoji: '🐝', bg: '#FFF59D', name: 'Honeybee' },

  // Food & Drink
  { emoji: '🍎', bg: '#EF9A9A', name: 'Apple' },
  { emoji: '🍌', bg: '#FFF59D', name: 'Banana' },
  { emoji: '🍕', bg: '#FFCC80', name: 'Pizza' },
  { emoji: '🍔', bg: '#FFB74D', name: 'Burger' },
  { emoji: '🍦', bg: '#F8BBD0', name: 'Ice Cream' },
  { emoji: '🍩', bg: '#D1C4E9', name: 'Donut' },
  { emoji: '🥑', bg: '#C8E6C9', name: 'Avocado' },
  { emoji: '🍉', bg: '#FFAB91', name: 'Watermelon' },
  { emoji: '🍟', bg: '#FFE082', name: 'French Fries' },
  { emoji: '🍣', bg: '#FFCDD2', name: 'Sushi' },
  { emoji: '☕', bg: '#D7CCC8', name: 'Coffee' },
  { emoji: '🍓', bg: '#FF8A80', name: 'Strawberry' },
  { emoji: '🌮', bg: '#FFE082', name: 'Taco' },
  { emoji: '🍿', bg: '#FFF59D', name: 'Popcorn' },
  { emoji: '🎂', bg: '#F48FB1', name: 'Birthday Cake' },

  // Smileys & Emotion
  { emoji: '😀', bg: '#FFE082', name: 'Grinning Face' },
  { emoji: '😎', bg: '#FFE082', name: 'Smiling Face with Sunglasses' },
  { emoji: '😍', bg: '#FF80AB', name: 'Smiling Face with Heart-Eyes' },
  { emoji: '🥳', bg: '#EA80FC', name: 'Partying Face' },
  { emoji: '😴', bg: '#9FA8DA', name: 'Sleeping Face' },
  { emoji: '🤖', bg: '#B0BEC5', name: 'Robot' },
  { emoji: '👻', bg: '#E0E0E0', name: 'Ghost' },
  { emoji: '👽', bg: '#C8E6C9', name: 'Alien' },
  { emoji: '🤡', bg: '#FF8A80', name: 'Clown Face' },
  { emoji: '💩', bg: '#D7CCC8', name: 'Pile of Poo' },

  // Objects & Activities
  { emoji: '⚽', bg: '#E0E0E0', name: 'Soccer Ball' },
  { emoji: '🏀', bg: '#FFCC80', name: 'Basketball' },
  { emoji: '🎸', bg: '#BCAAA4', name: 'Guitar' },
  { emoji: '🎮', bg: '#9FA8DA', name: 'Video Game' },
  { emoji: '🎨', bg: '#80DEEA', name: 'Artist Palette' },
  { emoji: '🚀', bg: '#90CAF9', name: 'Rocket' },
  { emoji: '🚗', bg: '#FF8A80', name: 'Automobile' },
  { emoji: '🎈', bg: '#FF8A80', name: 'Balloon' },
  { emoji: '🎁', bg: '#EA80FC', name: 'Wrapped Gift' },
  { emoji: '💡', bg: '#FFF59D', name: 'Light Bulb' },
  { emoji: '💎', bg: '#80DEEA', name: 'Gem Stone' },
  { emoji: '📷', bg: '#B0BEC5', name: 'Camera' },
  { emoji: '🎧', bg: '#CE93D8', name: 'Headphones' },
  { emoji: '📚', bg: '#A5D6A7', name: 'Books' },
  { emoji: '🔑', bg: '#FFE082', name: 'Key' },

  // Nature & Weather
  { emoji: '☀️', bg: '#FFF59D', name: 'Sun' },
  { emoji: '🌙', bg: '#9FA8DA', name: 'Crescent Moon' },
  { emoji: '🌈', bg: '#B388FF', name: 'Rainbow' },
  { emoji: '🔥', bg: '#FF8A65', name: 'Fire' },
  { emoji: '⭐', bg: '#FFE082', name: 'Star' },
  { emoji: '❄️', bg: '#80DEEA', name: 'Snowflake' },
  { emoji: '🌸', bg: '#F8BBD0', name: 'Cherry Blossom' },
  { emoji: '🌻', bg: '#FFE082', name: 'Sunflower' },
  { emoji: '🌵', bg: '#C8E6C9', name: 'Cactus' },
  { emoji: '🌊', bg: '#80DEEA', name: 'Water Wave' },

  // Symbols & Hearts
  { emoji: '❤️', bg: '#FF8A80', name: 'Red Heart' },
  { emoji: '💙', bg: '#90CAF9', name: 'Blue Heart' },
  { emoji: '💚', bg: '#A5D6A7', name: 'Green Heart' },
  { emoji: '💛', bg: '#FFF59D', name: 'Yellow Heart' },
  { emoji: '💜', bg: '#CE93D8', name: 'Purple Heart' },
  { emoji: '🖤', bg: '#B0BEC5', name: 'Black Heart' },
  { emoji: '✨', bg: '#FFE082', name: 'Sparkles' },
  { emoji: '🎉', bg: '#EA80FC', name: 'Party Popper' },
  { emoji: '🥇', bg: '#FFE082', name: '1st Place Medal' },
  { emoji: '🎯', bg: '#FF8A80', name: 'Bullseye' },

  // Extra Animals
  { emoji: 'Penguin', emoji: '🐧', bg: '#80DEEA', name: 'Penguin' },
  { emoji: '🐬', bg: '#80DEEA', name: 'Dolphin' },
  { emoji: '🐙', bg: '#F8BBD0', name: 'Octopus' },
  { emoji: '🐘', bg: '#B0BEC5', name: 'Elephant' },
  { emoji: '🦒', bg: '#FFE082', name: 'Giraffe' },

  // Extra Food
  { emoji: '🍇', bg: '#CE93D8', name: 'Grapes' },
  { emoji: '🍍', bg: '#FFE082', name: 'Pineapple' },
  { emoji: 'Cookie', emoji: '🍪', bg: '#FFCC80', name: 'Cookie' },
  { emoji: '🍿', bg: '#FFF59D', name: 'Popcorn' },
  { emoji: '🧋', bg: '#D7CCC8', name: 'Boba Tea' },

  // Travel & Places
  { emoji: '✈️', bg: '#90CAF9', name: 'Airplane' },
  { emoji: '🏰', bg: '#E1BEE7', name: 'Castle' },
  { emoji: '🎡', bg: '#F8BBD0', name: 'Ferris Wheel' },
  { emoji: '🏖️', bg: '#FFE082', name: 'Beach' },
  { emoji: '🌋', bg: '#FF8A65', name: 'Volcano' },

  // Objects & Miscellaneous
  { emoji: '⏰', bg: '#EF9A9A', name: 'Alarm Clock' },
  { emoji: '🔮', bg: '#D1C4E9', name: 'Crystal Ball' },
  { emoji: '📱', bg: '#CFD8DC', name: 'Mobile Phone' },
  { emoji: '💻', bg: '#B0BEC5', name: 'Laptop' },
  { emoji: '🕯️', bg: '#FFE082', name: 'Candle' },
  { emoji: '🎨', bg: '#80DEEA', name: 'Art' },
  { emoji: '🧸', bg: '#FFCC80', name: 'Teddy Bear' },
  { emoji: '👑', bg: '#FFE082', name: 'Crown' },
  { emoji: '🧪', bg: '#A5D6A7', name: 'Test Tube' },
  { emoji: '🔑', bg: '#FFE082', name: 'Key' }
        ];

        const DIFFICULTY = {
            easy:   { cols: 3 },
            medium: { cols: 4 },
            hard:   { cols: 5 },
            'extra-hard': { cols: 5 },
        };
        const LEVELS = [
            ...Array.from({ length: 70 }, (_, index) => ({
                pairs: 3 + Math.floor(index * 3 / 70),
                difficulty: 'easy',
            })),
            ...Array.from({ length: 70 }, (_, index) => ({
                pairs: 6 + Math.floor(index * 5 / 70),
                difficulty: 'medium',
            })),
            ...Array.from({ length: 70 }, (_, index) => ({
                pairs: 11 + Math.floor(index * 5 / 70),
                difficulty: 'hard',
            })),
            ...Array.from({ length: 70 }, (_, index) => ({
                pairs: 16 + Math.floor(index * 5 / 70),
                difficulty: 'extra-hard',
            })),
        ].map((level, index) => ({
            ...level,
            number: index + 1,
            face: ['🐣', '🐼', '🦊', '🐸', '🐬', '🦄', '🐉', '🚀', '🦁', '👑'][index % 10],
        }));
        const PROGRESS_KEY = 'memory-match-adventure-progress';
        const SETTINGS_KEY = 'memory-match-adventure-settings';
        const THEME_INFO = {
            light: { name: 'Classic', price: 0 },
            night: { name: 'Night', price: 0 },
            candy: { name: 'Candy', price: 0 },
            ocean: { name: 'Ocean', price: 60 },
            forest: { name: 'Forest', price: 90 },
            space: { name: 'Space', price: 120 },
        };
        const DAILY_MATCH_GOAL = 10;
        const DAILY_HINT_REWARD = 3;
        const DAILY_COIN_REWARD = 30;
        const ACHIEVEMENTS = [
            { id: 'first-match', title: 'A Perfect Pair', detail: 'Complete your first level.' },
            { id: 'five-levels', title: 'On a Roll', detail: 'Complete five levels.' },
            { id: 'ten-levels', title: 'Memory Explorer', detail: 'Complete ten levels.' },
            { id: 'five-combo', title: 'Streak Star', detail: 'Make five matches in a row.' },
            { id: 'perfect-level', title: 'Flawless Focus', detail: 'Finish a level in exactly one move per pair.' },
            { id: 'all-levels', title: 'Grand Adventurer', detail: 'Complete all 280 levels.' },
        ];

        function defaultProgress() {
            return {
                unlockedLevel: 1,
                completedLevels: [],
                bestScores: {},
                bestStars: {},
                achievements: [],
                lastPlayedLevel: 1,
                tutorialSeen: false,
                hintCredits: 0,
                dailyAchievement: { date: getLocalDateKey(), matches: 0, claimed: false },
                coins: 0,
                unlockedThemes: ['light', 'night', 'candy'],
                unlockedCardBacks: ['classic'],
                selectedCardBack: 'classic',
                powerups: { extraTime: 0, reveal: 0, undo: 0 },
                stats: { totalWins: 0, totalMoves: 0, totalPlayTime: 0, bestTime: null },
                dailyStreak: { lastLoginDate: '', rewardDate: '', days: 0 },
            };
        }

        function getLocalDateKey(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function normalizeDailyAchievement(saved) {
            const today = getLocalDateKey();
            if (!saved || saved.date !== today) {
                return { date: today, matches: 0, claimed: false };
            }
            return {
                date: today,
                matches: Number.isInteger(saved.matches) ? Math.min(DAILY_MATCH_GOAL, Math.max(0, saved.matches)) : 0,
                claimed: saved.claimed === true && saved.matches >= DAILY_MATCH_GOAL,
            };
        }

        function loadProgress() {
            try {
                const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
                if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultProgress();
                const validScores = saved.bestScores && typeof saved.bestScores === 'object' && !Array.isArray(saved.bestScores)
                    ? Object.fromEntries(Object.entries(saved.bestScores).filter(([level, score]) =>
                        Number.isInteger(Number(level)) && Number(level) >= 1 && Number(level) <= LEVELS.length &&
                        Number.isFinite(Number(score)) && Number(score) >= 0).map(([level, score]) => [level, Number(score)]))
                    : {};
                const validStars = saved.bestStars && typeof saved.bestStars === 'object' && !Array.isArray(saved.bestStars)
                    ? Object.fromEntries(Object.entries(saved.bestStars).filter(([level, stars]) =>
                        Number.isInteger(Number(level)) && Number(level) >= 1 && Number(level) <= LEVELS.length &&
                        Number.isInteger(stars) && stars >= 0 && stars <= 3))
                    : {};
                return {
                    unlockedLevel: Math.min(LEVELS.length, Math.max(1, Math.floor(Number(saved.unlockedLevel) || 1))),
                    completedLevels: Array.isArray(saved.completedLevels)
                        ? [...new Set(saved.completedLevels.filter(level => Number.isInteger(level) && level >= 1 && level <= LEVELS.length))]
                        : [],
                    bestScores: validScores,
                    bestStars: validStars,
                    achievements: Array.isArray(saved.achievements)
                        ? [...new Set(saved.achievements.filter(id => ACHIEVEMENTS.some(achievement => achievement.id === id)))]
                        : [],
                    lastPlayedLevel: Math.min(LEVELS.length, Math.max(1,
                        Number.isInteger(saved.lastPlayedLevel) ? saved.lastPlayedLevel : Number(saved.unlockedLevel) || 1)),
                    tutorialSeen: saved.tutorialSeen === true,
                    hintCredits: Number.isInteger(saved.hintCredits) ? Math.max(0, saved.hintCredits) : 0,
                    dailyAchievement: normalizeDailyAchievement(saved.dailyAchievement),
                    coins: Number.isSafeInteger(saved.coins) ? Math.max(0, saved.coins) : 0,
                    unlockedThemes: [...new Set([
                        'light',
                        'night',
                        'candy',
                        ...(Array.isArray(saved.unlockedThemes)
                            ? saved.unlockedThemes.filter(theme => Object.hasOwn(THEME_INFO, theme))
                            : []),
                    ])],
                    unlockedCardBacks: [...new Set([
                        'classic',
                        ...(Array.isArray(saved.unlockedCardBacks) ? saved.unlockedCardBacks.filter(id =>
                            ['royal', 'galaxy', 'ocean', 'neon', 'ember'].includes(id)
                            || (typeof id === 'string' && /^custom-[\w-]{1,80}$/.test(id))) : []),
                    ])],
                    selectedCardBack: (['classic', 'royal', 'galaxy', 'ocean', 'neon', 'ember']
                        .includes(saved.selectedCardBack)
                        || (typeof saved.selectedCardBack === 'string'
                            && /^custom-[\w-]{1,80}$/.test(saved.selectedCardBack)))
                        && (Array.isArray(saved.unlockedCardBacks)
                            ? saved.unlockedCardBacks
                            : ['classic']).includes(saved.selectedCardBack)
                        ? saved.selectedCardBack : 'classic',
                    powerups: {
                        extraTime: Number.isInteger(saved.powerups?.extraTime) ? Math.max(0, saved.powerups.extraTime) : 0,
                        reveal: Number.isInteger(saved.powerups?.reveal) ? Math.max(0, saved.powerups.reveal) : 0,
                        undo: Number.isInteger(saved.powerups?.undo) ? Math.max(0, saved.powerups.undo) : 0,
                    },
                    stats: {
                        totalWins: Number.isSafeInteger(saved.stats?.totalWins) ? Math.max(0, saved.stats.totalWins) : 0,
                        totalMoves: Number.isSafeInteger(saved.stats?.totalMoves) ? Math.max(0, saved.stats.totalMoves) : 0,
                        totalPlayTime: Number.isSafeInteger(saved.stats?.totalPlayTime) ? Math.max(0, saved.stats.totalPlayTime) : 0,
                        bestTime: Number.isInteger(saved.stats?.bestTime) && saved.stats.bestTime > 0
                            ? saved.stats.bestTime
                            : null,
                    },
                    dailyStreak: {
                        lastLoginDate: typeof saved.dailyStreak?.lastLoginDate === 'string'
                            ? saved.dailyStreak.lastLoginDate : '',
                        rewardDate: typeof saved.dailyStreak?.rewardDate === 'string'
                            ? saved.dailyStreak.rewardDate : '',
                        days: Number.isInteger(saved.dailyStreak?.days) ? Math.max(0, saved.dailyStreak.days) : 0,
                    },
                };
            } catch (error) {
                console.warn('Could not load saved game progress.', error);
                return defaultProgress();
            }
        }

        let progress = loadProgress();

        function loadSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
                return {
                    sound: saved?.sound !== false,
                    music: saved?.music === true,
                    animations: saved?.animations !== false,
                    theme: Object.hasOwn(THEME_INFO, saved?.theme) ? saved.theme : 'light',
                    highContrast: saved?.highContrast === true,
                    cardNames: saved?.cardNames === true,
                    backgroundBrightness: Number.isFinite(saved?.backgroundBrightness)
                        ? Math.min(1.2, Math.max(0.4, saved.backgroundBrightness)) : 0.88,
                    backgroundBlur: Number.isFinite(saved?.backgroundBlur)
                        ? Math.min(8, Math.max(0, saved.backgroundBlur)) : 0,
                    backgroundPosition: ['center', 'top', 'bottom'].includes(saved?.backgroundPosition)
                        ? saved.backgroundPosition : 'center',
                };
            } catch (error) {
                console.warn('Could not load game settings.', error);
                return {
                    sound: true, music: false, animations: true, theme: 'light',
                    highContrast: false, cardNames: false, backgroundBrightness: 0.88,
                    backgroundBlur: 0, backgroundPosition: 'center',
                };
            }
        }
        let settings = loadSettings();
        if (!progress.unlockedThemes.includes(settings.theme)) settings.theme = 'light';

        /* ============================
           Game State
           ============================ */
        let cards = [];
        let flippedIndices = [];
        let matchedCount = 0;
        let totalPairs = 0;
        let moves = 0;
        let timer = 0;
        let timeRemaining = 0;
        let levelTimeLimit = 0;
        let timerInterval = null;
        let isLocked = false;
        let currentDifficulty = 'easy';
        let score = 0;
        let combo = 0;
        let bestCombo = 0;
        let currentLevel = 1;
        let timerStartTimeout = null;
        let timerStarted = false;
        let hintTimeout = null;
        let gameGeneration = 0;
        let lastMismatchCards = null;
        let lastMismatchAvailable = false;
        let deferredInstallPrompt = null;
        let selectedDifficulty = null;

        /* ============================
           DOM References
           ============================ */
        const titleScreen = document.getElementById('title-screen');
        const gameScreen = document.getElementById('game-screen');
        const gameGrid = document.getElementById('game-grid');
        const winOverlay = document.getElementById('win-overlay');
        const comboTextEl = document.getElementById('combo-text');
        const installButton = document.getElementById('install-button');
        const difficultyPicker = document.getElementById('difficulty-picker');
        const levelSection = document.getElementById('level-section');
        const selectedLevels = document.getElementById('selected-levels');
        const installHelp = document.getElementById('install-help');
        const homeActions = document.querySelector('.home-actions');
        const settingsDialog = document.getElementById('settings-dialog');
        const achievementsDialog = document.getElementById('achievements-dialog');
        const tutorialDialog = document.getElementById('tutorial-dialog');
        const pauseDialog = document.getElementById('pause-dialog');
        const confirmDialog = document.getElementById('confirm-dialog');
        let pendingConfirmation = null;

        const DIFFICULTY_INFO = {
            easy: { label: 'Easy', icon: '🌱', range: 'Levels 1–70', first: 1, last: 70 },
            medium: { label: 'Medium', icon: '⚡', range: 'Levels 71–140', first: 71, last: 140 },
            hard: { label: 'Hard', icon: '🔥', range: 'Levels 141–210', first: 141, last: 210 },
            'extra-hard': { label: 'Extra Hard', icon: '💎', range: 'Levels 211–280', first: 211, last: 280 },
        };

        function isLevelUnlocked(level) {
            return level.number === 1
                || level.number <= progress.unlockedLevel
                || progress.completedLevels.includes(level.number - 1);
        }

        function showDifficultyLevels(difficulty) {
            selectedDifficulty = difficulty;
            const info = DIFFICULTY_INFO[difficulty];
            titleScreen.classList.add('selection-mode');
            homeActions.hidden = true;
            difficultyPicker.hidden = true;
            levelSection.hidden = false;
            document.getElementById('selected-difficulty-title').textContent = `${info.icon} ${info.label} levels`;
            document.getElementById('level-tier-title').textContent = `${info.icon} ${info.label}`;
            document.getElementById('level-tier-range').textContent = info.range;
            document.getElementById('selected-level-tier').className = `level-tier ${difficulty}-tier`;
            renderLevels();
            applySettings();
            updateHomeProgress();
            if (!progress.tutorialSeen) tutorialDialog.showModal();
            selectedLevels.querySelector('.level-btn.current')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }

        function showDifficultyPicker() {
            titleScreen.classList.add('selection-mode');
            homeActions.hidden = true;
            levelSection.hidden = true;
            difficultyPicker.hidden = false;
            updateHomeProgress();
        }

        function showCurrentDifficultyLevels() {
            const currentDifficultyInfo = LEVELS[currentLevel - 1];
            if (!currentDifficultyInfo) {
                goToMenu();
                return;
            }
            goToMenu();
            showDifficultyLevels(currentDifficultyInfo.difficulty);
        }

        /* Hide install controls for a saved installation or a standalone PWA window. */
        function isAppInstalled() {
            const standaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
            const standaloneIOS = window.navigator.standalone === true;
            const nativeDesktopApp = Boolean(window.__TAURI_INTERNALS__);

            try {
                return standaloneDisplay || standaloneIOS || nativeDesktopApp
                    || localStorage.getItem('memory-match-adventure-installed') === 'true';
            } catch (error) {
                console.warn('Could not read the saved app installation state.', error);
                return standaloneDisplay || standaloneIOS || nativeDesktopApp;
            }
        }

        function rememberAppInstalled() {
            installButton.hidden = true;
            deferredInstallPrompt = null;
            try {
                localStorage.setItem('memory-match-adventure-installed', 'true');
            } catch (error) {
                console.warn('Could not save the app installation state.', error);
            }
        }

        installButton.hidden = isAppInstalled();

        /* UI event bindings keep markup free of inline JavaScript handlers. */
        document.querySelectorAll('.difficulty-choice').forEach(button => {
            button.addEventListener('click', () => showDifficultyLevels(button.dataset.difficulty));
        });

        document.getElementById('all-difficulties-back').addEventListener('click', () => {
            difficultyPicker.hidden = true;
            homeActions.hidden = false;
            titleScreen.classList.remove('selection-mode');
        });

        document.getElementById('difficulty-back').addEventListener('click', () => {
            selectedDifficulty = null;
            levelSection.hidden = true;
            difficultyPicker.hidden = false;
        });

        document.getElementById('play-button').addEventListener('click', showDifficultyPicker);
        document.getElementById('continue-button').addEventListener('click', () => startGame(progress.lastPlayedLevel));
        document.getElementById('levels-button').addEventListener('click', showDifficultyPicker);
        document.getElementById('extras-button').addEventListener('click', () => {
            window.location.href = 'features/index.html';
        });
        document.getElementById('settings-button').addEventListener('click', () => settingsDialog.showModal());
        document.getElementById('achievements-button').addEventListener('click', () => {
            renderAchievements();
            achievementsDialog.showModal();
        });
        document.getElementById('tutorial-button').addEventListener('click', () => tutorialDialog.showModal());
        document.getElementById('tutorial-close').addEventListener('click', () => {
            progress.tutorialSeen = true;
            saveProgress();
            tutorialDialog.close();
        });
        tutorialDialog.addEventListener('cancel', () => {
            progress.tutorialSeen = true;
            saveProgress();
        });
        document.querySelectorAll('[data-close-dialog]').forEach(button => {
            button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close());
        });
        document.getElementById('menu-button').addEventListener('click', () => goToMenu());
        document.getElementById('play-again-button').addEventListener('click', playAgain);
        document.getElementById('next-level-button').addEventListener('click', startNextLevel);
        document.getElementById('victory-levels-button').addEventListener('click', showCurrentDifficultyLevels);
        document.getElementById('pause-button').addEventListener('click', pauseGame);
        document.getElementById('resume-button').addEventListener('click', resumeGame);
        document.getElementById('hint-button').addEventListener('click', useHint);
        document.getElementById('extra-time-button').addEventListener('click', useExtraTime);
        document.getElementById('reveal-button').addEventListener('click', useRevealPowerup);
        document.getElementById('undo-button').addEventListener('click', undoLastMismatch);
        document.getElementById('restart-button').addEventListener('click', () => {
            pauseDialog.close();
            requestConfirmation('Restart this level? Your current score and moves will be lost.', () => startGame(currentLevel), true);
        });
        document.getElementById('quit-button').addEventListener('click', () => {
            pauseDialog.close();
            goToMenu();
        });
        document.getElementById('confirm-cancel').addEventListener('click', () => {
            confirmDialog.close();
            if (confirmDialog.dataset.returnToPause === 'true') pauseDialog.showModal();
            confirmDialog.dataset.returnToPause = 'false';
            pendingConfirmation = null;
        });
        document.getElementById('confirm-accept').addEventListener('click', () => {
            confirmDialog.close();
            if (pendingConfirmation) pendingConfirmation();
            pendingConfirmation = null;
        });
        document.getElementById('reset-progress-button').addEventListener('click', () => {
            settingsDialog.close();
            requestConfirmation('Reset all unlocked levels, records, stars, and achievements on this device? Daily challenge progress and earned hints will be kept.', () => {
                const dailyAchievement = progress.dailyAchievement;
                const hintCredits = progress.hintCredits;
                progress = {
                    ...defaultProgress(),
                    dailyAchievement,
                    hintCredits,
                    coins: progress.coins,
                    unlockedThemes: progress.unlockedThemes,
                    unlockedCardBacks: progress.unlockedCardBacks,
                    selectedCardBack: progress.selectedCardBack,
                    powerups: progress.powerups,
                    dailyStreak: progress.dailyStreak,
                };
                saveProgress();
                renderLevels();
                updateDailyAchievementDisplay();
                updateDisplays();
                updateHomeProgress();
                settingsDialog.showModal();
            });
        });
        document.getElementById('sound-setting').addEventListener('change', event => {
            settings.sound = event.target.checked;
            audioPreferences.sound = settings.sound;
            document.getElementById('custom-audio-settings').hidden = !settings.sound;
            saveSettings();
        });
        document.getElementById('music-setting').addEventListener('change', event => {
            settings.music = event.target.checked;
            setMusicEnabled(settings.music);
            saveSettings();
        });
        const customAudioFileInput = document.getElementById('custom-audio-file');
        const confirmCustomAudioButton = document.getElementById('confirm-custom-audio');
        document.getElementById('choose-custom-audio').addEventListener('click', () => customAudioFileInput.click());
        customAudioFileInput.addEventListener('change', event => {
            selectedMusicFiles = Array.from(event.target.files || []);
            event.target.value = '';
            const validFiles = selectedMusicFiles.filter(file =>
                file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name));
            selectedMusicFiles = validFiles;
            confirmCustomAudioButton.disabled = selectedMusicFiles.length === 0;
            document.getElementById('custom-audio-selection').textContent = selectedMusicFiles.length
                ? `${selectedMusicFiles.length} MP3 ${selectedMusicFiles.length === 1 ? 'file' : 'files'} selected.`
                : 'No valid MP3 files selected.';
        });
        confirmCustomAudioButton.addEventListener('click', async () => {
            if (!selectedMusicFiles.length) return;
            const filesToAdd = selectedMusicFiles;
            confirmCustomAudioButton.disabled = true;
            try {
                const newTracks = filesToAdd.map(file => ({
                    id: globalThis.crypto?.randomUUID?.()
                        || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file,
                    name: file.name,
                }));
                const updatedPlaylist = [...customMusicPlaylist, ...newTracks];
                await storeCustomMusic(updatedPlaylist);
                customMusicPlaylist = updatedPlaylist;
                selectedMusicFiles = [];
                document.getElementById('custom-audio-selection').textContent = 'No new MP3 files selected.';
                setCustomAudioStatus(`${newTracks.length} ${newTracks.length === 1 ? 'track' : 'tracks'} added to your playlist.`);
                renderCustomMusicPlaylist();
            } catch (error) {
                console.warn('Could not add MP3 files to your playlist.', error);
                setCustomAudioStatus('Could not save the selected MP3 files. Check device storage and try again.');
                confirmCustomAudioButton.disabled = false;
            }
        });
        document.getElementById('remove-custom-audio').addEventListener('click', async () => {
            const previousPlaylist = [...customMusicPlaylist];
            const player = document.getElementById('custom-music-player');
            player.pause();
            customMusicPlaylist = [];
            currentMusicIndex = -1;
            try {
                await storeCustomMusic([]);
                player.removeAttribute('src');
                player.load();
                if (customMusicObjectUrl) URL.revokeObjectURL(customMusicObjectUrl);
                customMusicObjectUrl = null;
                renderCustomMusicPlaylist();
            } catch (error) {
                console.warn('Could not clear the saved MP3 playlist.', error);
                customMusicPlaylist = previousPlaylist;
                renderCustomMusicPlaylist();
                setCustomAudioStatus('Could not remove the playlist. Please try again.');
            }
        });
        const customMusicPlayer = document.getElementById('custom-music-player');
        customMusicPlayer.addEventListener('ended', () => {
            const nextTrack = currentMusicIndex + 1;
            if (nextTrack < customMusicPlaylist.length) {
                setCustomMusic(nextTrack);
            } else if (audioPreferences.music && customMusicPlaylist.length) {
                setCustomMusic(0);
            } else {
                setCustomAudioStatus('Playlist finished.');
            }
        });
        customMusicPlayer.addEventListener('error', () => {
            setCustomAudioStatus('This MP3 could not be played by the browser. Try a different audio file.');
        });
        document.getElementById('animations-setting').addEventListener('change', event => {
            settings.animations = event.target.checked;
            applySettings();
            saveSettings();
        });
        const themeSetting = document.getElementById('theme-setting');
        const customBackgroundSettings = document.getElementById('custom-background-settings');
        const showCustomBackgroundSettings = () => {
            customBackgroundSettings.hidden = false;
        };
        themeSetting.addEventListener('focus', showCustomBackgroundSettings);
        themeSetting.addEventListener('click', showCustomBackgroundSettings);
        themeSetting.addEventListener('change', event => {
            showCustomBackgroundSettings();
            if (!progress.unlockedThemes.includes(event.target.value)) {
                event.target.value = settings.theme;
                window.location.href = 'features/themes.html';
                return;
            }
            settings.theme = event.target.value;
            applySettings();
            saveSettings();
        });
        const customBackgroundFileInput = document.getElementById('custom-background-file');
        document.getElementById('choose-custom-background').addEventListener('click', () => customBackgroundFileInput.click());
        customBackgroundFileInput.addEventListener('change', event => {
            const selectedFiles = Array.from(event.target.files || []);
            event.target.value = '';
            const imageFiles = selectedFiles.filter(file =>
                file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name));
            renderBackgroundChoices(imageFiles);
            document.getElementById('custom-background-selection').textContent = imageFiles.length
                ? `${imageFiles.length} ${imageFiles.length === 1 ? 'image' : 'images'} ready. Select one to continue.`
                : 'No supported images selected.';
        });
        document.getElementById('add-custom-background').addEventListener('click', async () => {
            if (!selectedBackgroundFile) return;
            const background = selectedBackgroundFile;
            const addButton = document.getElementById('add-custom-background');
            addButton.disabled = true;
            try {
                await storeCustomBackground(background);
                applyCustomBackground(background, background.name);
                document.getElementById('custom-background-selection').textContent = `${background.name} added as your background.`;
            } catch (error) {
                console.warn('Could not save the selected background.', error);
                document.getElementById('custom-background-status').textContent =
                    'Could not save this image. Check device storage and try again.';
                addButton.disabled = false;
            }
        });
        document.getElementById('remove-custom-background').addEventListener('click', async event => {
            const removeButton = event.currentTarget;
            removeButton.disabled = true;
            try {
                await storeCustomBackground(null);
                if (customBackgroundObjectUrl) URL.revokeObjectURL(customBackgroundObjectUrl);
                customBackgroundObjectUrl = null;
                document.body.style.removeProperty('--custom-background-image');
                delete document.body.dataset.customBackground;
                document.getElementById('custom-background-status').textContent = 'Using the default background.';
            } catch (error) {
                console.warn('Could not remove the saved custom background.', error);
                document.getElementById('custom-background-status').textContent =
                    'Could not remove the background. Please try again.';
                removeButton.disabled = false;
            }
        });

        document.getElementById('install-help-close').addEventListener('click', () => installHelp.close());

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            if (isAppInstalled()) {
                installButton.hidden = true;
                return;
            }
            deferredInstallPrompt = event;
            installButton.hidden = false;
            installButton.textContent = '⬇ Install app';
        });

        installButton.addEventListener('click', async () => {
            if (!deferredInstallPrompt) {
                installHelp.showModal();
                return;
            }
            const installPrompt = deferredInstallPrompt;
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            deferredInstallPrompt = null;
            if (outcome === 'accepted') {
                rememberAppInstalled();
            } else {
                installButton.textContent = '📥 Install on this device';
            }
        });

        window.addEventListener('appinstalled', rememberAppInstalled);

        /* Persistence module: validate stored values before using browser saves. */
        function saveProgress() {
            try {
                localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
            } catch (error) {
                console.warn('Could not save game progress on this device.', error);
            }
        }

        function saveSettings() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            } catch (error) {
                console.warn('Could not save game settings on this device.', error);
            }
        }

        function claimDailyStreakReward() {
            const today = getLocalDateKey();
            if (progress.dailyStreak.rewardDate === today) return;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            progress.dailyStreak.days = progress.dailyStreak.lastLoginDate === getLocalDateKey(yesterday)
                ? progress.dailyStreak.days + 1
                : 1;
            progress.dailyStreak.lastLoginDate = today;
            progress.dailyStreak.rewardDate = today;
            progress.coins += 5;
            progress.hintCredits++;
            saveProgress();
        }

        function applySettings() {
            document.body.dataset.theme = settings.theme;
            document.body.dataset.animations = settings.animations ? 'on' : 'off';
            document.body.dataset.cardBack = progress.selectedCardBack;
            applyAccessibilitySettings();
            document.body.style.setProperty('--custom-background-brightness', settings.backgroundBrightness);
            document.body.style.setProperty('--custom-background-blur', `${settings.backgroundBlur}px`);
            document.body.style.setProperty('--custom-background-position', settings.backgroundPosition);
            document.getElementById('sound-setting').checked = settings.sound;
            document.getElementById('music-setting').checked = settings.music;
            document.getElementById('animations-setting').checked = settings.animations;
            document.getElementById('theme-setting').value = settings.theme;
            audioPreferences.sound = settings.sound;
            if (settings.music) setMusicEnabled(true);
            else setMusicEnabled(false);
        }

        function updateHomeProgress() {
            const completedCount = progress.completedLevels.length;
            document.getElementById('home-progress').textContent =
                `${completedCount} / ${LEVELS.length} levels complete · Continue at level ${progress.lastPlayedLevel}`;
        }

        function requestConfirmation(message, action, returnToPause = false) {
            document.getElementById('confirm-message').textContent = message;
            pendingConfirmation = action;
            confirmDialog.dataset.returnToPause = String(returnToPause);
            confirmDialog.showModal();
        }

        function renderAchievements() {
            updateDailyAchievementDisplay();
            const list = document.getElementById('achievement-list');
            list.replaceChildren();
            ACHIEVEMENTS.forEach(achievement => {
                const unlocked = progress.achievements.includes(achievement.id);
                const row = document.createElement('div');
                row.className = `achievement-row${unlocked ? '' : ' locked'}`;
                row.innerHTML = `<span aria-hidden="true">${unlocked ? '🏆' : '🔒'}</span><span><strong>${achievement.title}</strong><br><small>${achievement.detail}</small></span><span>${unlocked ? 'Earned' : 'Locked'}</span>`;
                list.appendChild(row);
            });
        }

        function updateDailyAchievementDisplay() {
            const today = getLocalDateKey();
            if (progress.dailyAchievement.date !== today) {
                progress.dailyAchievement = { date: today, matches: 0, claimed: false };
                saveProgress();
            }

            const { matches, claimed } = progress.dailyAchievement;
            const progressBar = document.querySelector('.daily-progress-track');
            document.getElementById('daily-progress-fill').style.width =
                `${matches / DAILY_MATCH_GOAL * 100}%`;
            progressBar.setAttribute('aria-valuenow', matches);
            document.getElementById('daily-achievement-status').textContent = claimed
                ? `Daily challenge complete! ${DAILY_HINT_REWARD} hints and ${DAILY_COIN_REWARD} coins earned.`
                : `${matches} / ${DAILY_MATCH_GOAL} pairs matched today`;
            document.getElementById('hint-credit-count').textContent =
                `💡 ${progress.hintCredits} ${progress.hintCredits === 1 ? 'hint' : 'hints'}`;
        }

        function recordDailyMatch() {
            updateDailyAchievementDisplay();
            if (progress.dailyAchievement.claimed) return;

            progress.dailyAchievement.matches = Math.min(
                DAILY_MATCH_GOAL,
                progress.dailyAchievement.matches + 1,
            );
            if (progress.dailyAchievement.matches === DAILY_MATCH_GOAL) {
                progress.dailyAchievement.claimed = true;
                progress.hintCredits += DAILY_HINT_REWARD;
                progress.coins += DAILY_COIN_REWARD;
            }
            saveProgress();
            updateDailyAchievementDisplay();
            updateDisplays();
        }

        function awardAchievement(id) {
            if (!progress.achievements.includes(id)) {
                progress.achievements.push(id);
                saveProgress();
            }
        }

        /* Level browser: render one chapter and synchronize unlock/progress UI. */
        function renderLevels() {
            selectedLevels.innerHTML = '';
            Object.entries(DIFFICULTY_INFO).forEach(([difficulty]) => {
                const levels = LEVELS.filter(level => level.difficulty === difficulty);
                const completed = levels.filter(level => progress.completedLevels.includes(level.number)).length;
                document.getElementById(`${difficulty}-progress`).textContent = `${completed} / ${levels.length}`;
            });
            if (!selectedDifficulty) return;

            LEVELS.filter(level => level.difficulty === selectedDifficulty).forEach(level => {
                const completed = progress.completedLevels.includes(level.number);
                const unlocked = isLevelUnlocked(level);
                const button = document.createElement('button');
                const isNext = level.number === progress.unlockedLevel
                    || (level.number === DIFFICULTY_INFO[selectedDifficulty].first && unlocked && !completed);
                button.className = `level-btn${completed ? ' completed' : ''}${isNext ? ' current' : ''}`;
                button.disabled = !unlocked;
                button.setAttribute('aria-label', `Level ${level.number}, ${level.pairs} pairs${unlocked ? '' : ', locked'}`);
                const best = Number(progress.bestScores[level.number]) || 0;
                const stars = Number(progress.bestStars[level.number]) || 0;
                button.innerHTML = `<span class="level-face" aria-hidden="true">${unlocked ? level.face : '🔒'}</span><span class="level-number">${level.number}</span><span class="level-caption">${level.pairs} pairs${completed ? ' · ✓' : ''}${best ? `<br>Best ${best}` : ''}${stars ? `<br>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : ''}</span>`;
                if (unlocked) button.addEventListener('click', () => startGame(level.number));
                selectedLevels.appendChild(button);
            });
            const difficultyLevels = LEVELS.filter(level => level.difficulty === selectedDifficulty);
            const completedInDifficulty = difficultyLevels.filter(level => progress.completedLevels.includes(level.number)).length;
            document.getElementById('progress-display').textContent =
                `${completedInDifficulty} / ${difficultyLevels.length} completed`;
            const progressFill = document.getElementById('progress-fill');
            const progressBar = progressFill.parentElement;
            progressBar.setAttribute('aria-valuemax', difficultyLevels.length);
            progressFill.style.width = `${completedInDifficulty / difficultyLevels.length * 100}%`;
            progressBar.setAttribute('aria-valuenow', completedInDifficulty);
        }

        /* ============================
           Floating Background Shapes
           ============================ */
        (function createFloatingShapes() {
            const container = document.getElementById('floating-shapes');
            const colors = ['var(--sky-blue)', 'var(--pink)', 'var(--bright-yellow)', 'var(--light-green)', 'var(--fluoro-cyan)'];
            for (let i = 0; i < 15; i++) {
                const shape = document.createElement('div');
                shape.className = 'float-shape';
                const size = 20 + Math.random() * 60;
                shape.style.cssText = `
                    width: ${size}px;
                    height: ${size}px;
                    left: ${Math.random() * 100}%;
                    background: ${colors[i % colors.length]};
                    animation-duration: ${12 + Math.random() * 18}s;
                    animation-delay: ${-Math.random() * 20}s;
                `;
                container.appendChild(shape);
            }
        })();

        /* ============================
           Screen Transitions
           ============================ */
        function showScreen(screen) {
            [titleScreen, gameScreen].forEach(s => s.classList.add('hidden'));
            screen.classList.remove('hidden');
        }

        function goToMenu() {
            gameGeneration++;
            stopTimer();
            clearInterval(timerInterval);
            clearTimeout(timerStartTimeout);
            clearTimeout(hintTimeout);
            winOverlay.classList.remove('show');
            document.getElementById('confetti-container').innerHTML = '';
            isLocked = false;
            timerStarted = false;
            selectedDifficulty = null;
            levelSection.hidden = true;
            difficultyPicker.hidden = true;
            homeActions.hidden = false;
            titleScreen.classList.remove('selection-mode');
            if (pauseDialog.open) pauseDialog.close();
            renderLevels();
            updateHomeProgress();
            showScreen(titleScreen);
        }

        /* Gameplay lifecycle: screen transitions, timer, pause, and hints. */
        function getLevelTimeLimit(level) {
            return 60 + level.pairs * 15;
        }

        function startTimer() {
            if (timerInterval !== null) return;
            timerInterval = setInterval(() => {
                timer++;
                timeRemaining = Math.max(0, timeRemaining - 1);
                document.getElementById('time-display').textContent = formatTime(timeRemaining);
                if (timeRemaining === 0) handleTimeUp();
            }, 1000);
        }

        function stopTimer() {
            if (timerInterval !== null) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }

        function pauseGame() {
            if (isLocked || pauseDialog.open) return;
            clearTimeout(timerStartTimeout);
            timerStarted = true;
            stopTimer();
            pauseDialog.showModal();
        }

        function resumeGame() {
            pauseDialog.close();
            if (timerStarted && timeRemaining > 0) startTimer();
        }

        function handleTimeUp() {
            stopTimer();
            clearTimeout(timerStartTimeout);
            clearTimeout(hintTimeout);
            hintTimeout = null;
            timerStarted = false;
            isLocked = true;
            gameGeneration++;

            document.getElementById('win-title').textContent = "Time's up!";
            document.getElementById('game-over-message').textContent =
                `Level ${currentLevel} ran out of time. Try again with a fresh ${formatTime(levelTimeLimit)}.`;
            document.getElementById('game-over-message').hidden = false;
            document.getElementById('win-card').hidden = true;
            document.getElementById('play-again-button').textContent = 'Try Again';
            document.getElementById('next-level-button').hidden = true;
            winOverlay.classList.add('show');
        }

        function useHint() {
            if (isLocked || flippedIndices.length || hintTimeout !== null || progress.hintCredits < 1) return;
            const available = Array.from(gameGrid.children)
                .map((container, index) => ({ container, index }))
                .filter(({ container }) => !container.classList.contains('matched'));
            if (available.length < 2) return;
            const first = available[0];
            const pair = available.find(({ index }) => index !== first.index && cards[index].emoji === cards[first.index].emoji);
            if (!pair) return;
            progress.hintCredits--;
            saveProgress();
            isLocked = true;
            [first, pair].forEach(({ container, index }) => {
                container.classList.add('flipped', 'hinted');
                container.setAttribute('aria-label', `Card ${index + 1}, hint: ${cards[index].name}`);
            });
            updateDisplays();
            hintTimeout = setTimeout(() => {
                [first, pair].forEach(({ container, index }) => {
                    if (!container.classList.contains('matched')) {
                        container.classList.remove('flipped', 'hinted');
                        container.setAttribute('aria-label', `Card ${index + 1}, face down`);
                    }
                });
                hintTimeout = null;
                isLocked = false;
                updateDisplays();
            }, 1100);
        }

        function useExtraTime() {
            if (isLocked || progress.powerups.extraTime < 1 || timeRemaining < 1) return;
            progress.powerups.extraTime--;
            timeRemaining += 60;
            saveProgress();
            updateDisplays();
            document.getElementById('time-display').textContent = formatTime(timeRemaining);
        }

        function useRevealPowerup() {
            if (isLocked || flippedIndices.length || hintTimeout !== null || progress.powerups.reveal < 1) return;
            const available = Array.from(gameGrid.children)
                .map((container, index) => ({ container, index }))
                .filter(({ container }) => !container.classList.contains('matched'));
            const first = available[0];
            const pair = first && available.find(({ index }) =>
                index !== first.index && cards[index].emoji === cards[first.index].emoji);
            if (!first || !pair) return;

            progress.powerups.reveal--;
            saveProgress();
            isLocked = true;
            [first, pair].forEach(({ container, index }) => {
                container.classList.add('flipped', 'hinted');
                container.setAttribute('aria-label', `Card ${index + 1}, reveal: ${cards[index].name}`);
            });
            updateDisplays();
            hintTimeout = setTimeout(() => {
                [first, pair].forEach(({ container, index }) => {
                    if (!container.classList.contains('matched')) {
                        container.classList.remove('flipped', 'hinted');
                        container.setAttribute('aria-label', `Card ${index + 1}, face down`);
                    }
                });
                hintTimeout = null;
                isLocked = false;
                updateDisplays();
            }, 1800);
        }

        function undoLastMismatch() {
            if (!lastMismatchAvailable || !lastMismatchCards || progress.powerups.undo < 1) return;
            progress.powerups.undo--;
            cards = [...lastMismatchCards];
            lastMismatchAvailable = false;
            lastMismatchCards = null;
            moves = Math.max(0, moves - 1);
            Array.from(gameGrid.children).forEach((container, index) => {
                const card = cards[index];
                container.classList.remove('flipped', 'shake');
                container.setAttribute('aria-label', `Card ${index + 1}, face down`);
                container.querySelector('.card-front').innerHTML = `
                    <div class="card-icon-circle" style="background:${card.bg};">
                        <span class="card-icon">${settings.cardNames ? `${card.emoji} ${card.name}` : card.emoji}</span>
                    </div>
                `;
            });
            saveProgress();
            updateDisplays();
        }

        /* ============================
           Shuffle
           ============================ */
        function shuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        /* ============================
           Start Game
           ============================ */
        /* Round setup: build a shuffled deck from the selected level definition. */
        function startGame(levelNumber) {
            const level = LEVELS[levelNumber - 1];
            if (!level || !isLevelUnlocked(level)) return;
            gameGeneration++;
            ensureAudio();
            if (settings.music) setMusicEnabled(true);
            currentLevel = levelNumber;
            progress.lastPlayedLevel = levelNumber;
            saveProgress();
            updateHomeProgress();
            currentDifficulty = level.difficulty;
            const config = DIFFICULTY[currentDifficulty];
            totalPairs = level.pairs;
            matchedCount = 0;
            moves = 0;
            timer = 0;
            levelTimeLimit = getLevelTimeLimit(level);
            timeRemaining = levelTimeLimit;
            lastMismatchCards = null;
            lastMismatchAvailable = false;
            score = 0;
            combo = 0;
            bestCombo = 0;
            flippedIndices = [];
            isLocked = false;
            timerStarted = false;

            stopTimer();
            clearInterval(timerInterval);
            clearTimeout(timerStartTimeout);
            clearTimeout(hintTimeout);
            hintTimeout = null;
            if (pauseDialog.open) pauseDialog.close();

            const selectedIcons = shuffle(CARD_ICONS).slice(0, level.pairs);
            cards = shuffle([...selectedIcons, ...selectedIcons]);

            gameGrid.className = 'game-grid' + (currentDifficulty === 'hard' || currentDifficulty === 'extra-hard' ? ' hard-mode' : '');
            gameGrid.style.gridTemplateColumns = `repeat(${config.cols}, minmax(0, 1fr))`;
            gameGrid.innerHTML = '';
            document.getElementById('level-banner').textContent =
                `Level ${level.number} · ${level.pairs} pairs · ${level.difficulty} · ${formatTime(levelTimeLimit)} limit`;

            cards.forEach((icon, index) => {
                const container = document.createElement('div');
                container.className = 'card-container';
                container.style.animationDelay = `${index * 0.05}s`;
                container.setAttribute('tabindex', '0');
                container.setAttribute('role', 'button');
                container.setAttribute('aria-label', `Card ${index + 1}, face down`);
                container.dataset.index = index;

                container.innerHTML = `
                    <div class="card">
                        <div class="card-face card-back">
                            <div class="card-back-pattern"></div>
                        </div>
                        <div class="card-face card-front">
                            <div class="card-icon-circle" style="background:${icon.bg};">
                                <span class="card-icon">${settings.cardNames ? `${icon.emoji} ${icon.name}` : icon.emoji}</span>
                            </div>
                        </div>
                    </div>
                `;

                container.addEventListener('click', () => flipCard(index));
                container.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        flipCard(index);
                    }
                });

                gameGrid.appendChild(container);
            });

            updateDisplays();
            document.getElementById('time-display').textContent = formatTime(timeRemaining);
            document.getElementById('win-title').textContent = 'You Win!';
            document.getElementById('game-over-message').hidden = true;
            document.getElementById('win-card').hidden = false;
            document.getElementById('play-again-button').textContent = 'Play Again';
            showScreen(gameScreen);

            timerStartTimeout = setTimeout(() => {
                timerStarted = true;
                startTimer();
            }, cards.length * 50 + 400);
        }

        function playAgain() {
            winOverlay.classList.remove('show');
            document.getElementById('confetti-container').innerHTML = '';
            startGame(currentLevel);
        }

        function startNextLevel() {
            const nextLevel = LEVELS[currentLevel];
            if (nextLevel && isLevelUnlocked(nextLevel)) {
                winOverlay.classList.remove('show');
                document.getElementById('confetti-container').innerHTML = '';
                startGame(currentLevel + 1);
            }
        }

        /* ============================
           Flip Card Logic
           ============================ */
        /* Turn resolution: flips, pair matches, streaks, and mismatch recovery. */
        function flipCard(index) {
            if (isLocked) return;

            const container = gameGrid.children[index];
            if (!container) return;
            if (container.classList.contains('flipped') || container.classList.contains('matched')) return;
            if (flippedIndices.includes(index)) return;

            lastMismatchAvailable = false;
            lastMismatchCards = null;
            container.classList.add('flipped');
            container.setAttribute('aria-label', `Card ${index + 1}, showing ${cards[index].name}`);
            flippedIndices.push(index);
            playFlipSound();
            updateDisplays();

            if (flippedIndices.length === 2) {
                moves++;
                isLocked = true;
                const generation = gameGeneration;
                const [i1, i2] = flippedIndices;
                const c1 = gameGrid.children[i1];
                const c2 = gameGrid.children[i2];

                if (cards[i1].emoji === cards[i2].emoji) {
                    setTimeout(() => {
                        if (generation === gameGeneration) handleMatch(i1, i2, c1, c2);
                    }, 400);
                } else {
                    setTimeout(() => {
                        if (generation === gameGeneration) handleMismatch(i1, i2, c1, c2);
                    }, 800);
                }

                flippedIndices = [];
                updateDisplays();
            }
        }

        function handleMatch(i1, i2, c1, c2) {
            if (!c1.isConnected || !c2.isConnected) return;
            c1.classList.add('matched');
            c2.classList.add('matched');
            c1.setAttribute('aria-label', `Card ${i1 + 1}, matched ${cards[i1].name}`);
            c2.setAttribute('aria-label', `Card ${i2 + 1}, matched ${cards[i2].name}`);

            matchedCount++;
            recordDailyMatch();
            combo++;
            if (combo > bestCombo) bestCombo = combo;
            if (combo >= 5) awardAchievement('five-combo');

            const comboBonus = Math.max(0, (combo - 1)) * 50;
            score += 100 + comboBonus;
            lastMismatchAvailable = false;
            lastMismatchCards = null;

            playMatchSound();

            if (combo >= 2) {
                showCombo(combo);
                playComboSound(combo);
            }

            createMatchParticles(c1);
            createMatchParticles(c2);
            updateDisplays();

            if (matchedCount === totalPairs) {
                stopTimer();
                clearTimeout(timerStartTimeout);
                timerStarted = false;
                const generation = gameGeneration;
                setTimeout(() => {
                    if (generation === gameGeneration) handleWin();
                }, 600);
            } else {
                isLocked = false;
                updateDisplays();
            }
        }

        function handleMismatch(i1, i2, c1, c2) {
            const generation = gameGeneration;
            const cardsBeforeMismatch = [...cards];
            combo = 0;
            playMismatchSound();

            // Shake the mismatched cards
            c1.classList.add('shake');
            c2.classList.add('shake');

            // After shake, flip them back down
            setTimeout(() => {
                if (generation !== gameGeneration) return;
                c1.classList.remove('flipped', 'shake');
                c2.classList.remove('flipped', 'shake');
                c1.setAttribute('aria-label', `Card ${i1 + 1}, face down`);
                c2.setAttribute('aria-label', `Card ${i2 + 1}, face down`);

                reshuffleUnmatchedCards();
                lastMismatchCards = cardsBeforeMismatch;
                lastMismatchAvailable = true;

                setTimeout(() => {
                    if (generation === gameGeneration) {
                        isLocked = false;
                        updateDisplays();
                    }
                }, 300);
            }, 500);
        }

        function reshuffleUnmatchedCards() {
            const positions = Array.from(gameGrid.children)
                .map((container, index) => ({ container, index }))
                .filter(({ container }) => !container.classList.contains('matched'));
            const previousCards = positions.map(({ index }) => cards[index]);
            if (previousCards.length < 4) return;

            let shuffledCards = previousCards;
            for (let attempt = 0; attempt < 50; attempt++) {
                shuffledCards = shuffle(previousCards);
                if (shuffledCards.every((card, index) => card.emoji !== previousCards[index].emoji)) break;
            }

            if (shuffledCards.some((card, index) => card.emoji === previousCards[index].emoji)) {
                const groupedCards = shuffle(previousCards)
                    .sort((first, second) => first.emoji.localeCompare(second.emoji));
                const groupedPositions = [...positions]
                    .sort((first, second) => cards[first.index].emoji.localeCompare(cards[second.index].emoji));
                const replacementByIndex = new Map();
                const pairCount = groupedCards.length / 2;

                groupedPositions.forEach(({ index }, position) => {
                    replacementByIndex.set(index, groupedCards[(position + pairCount) % groupedCards.length]);
                });
                shuffledCards = positions.map(({ index }) => replacementByIndex.get(index));
            }

            positions.forEach(({ container, index }, position) => {
                const card = shuffledCards[position];
                cards[index] = card;
                container.setAttribute('aria-label', `Card ${index + 1}, face down`);
                container.querySelector('.card-front').innerHTML = `
                    <div class="card-icon-circle" style="background:${card.bg};">
                        <span class="card-icon">${card.emoji}</span>
                    </div>
                `;
            });
        }

        /* ============================
           Win Handler
           ============================ */
        /* Round completion: persist the result and present the victory dialog. */
        function handleWin() {
            stopTimer();
            clearTimeout(timerStartTimeout);
            timerStarted = false;

            const timeBonus = Math.max(0, 300 - timer * 2);
            const moveBonus = Math.max(0, (totalPairs * 3 - moves) * 10);
            score += timeBonus + moveBonus;

            const firstCompletion = !progress.completedLevels.includes(currentLevel);
            if (firstCompletion) {
                progress.completedLevels.push(currentLevel);
                progress.completedLevels.sort((a, b) => a - b);
            }
            progress.unlockedLevel = Math.min(LEVELS.length, Math.max(progress.unlockedLevel, currentLevel + 1));
            progress.lastPlayedLevel = Math.min(LEVELS.length, currentLevel + 1);
            const previousBest = Number(progress.bestScores[currentLevel]) || 0;
            progress.bestScores[currentLevel] = Math.max(previousBest, score);
            const stars = moves <= totalPairs + 1 ? 3 : moves <= totalPairs * 2 ? 2 : 1;
            progress.bestStars[currentLevel] = Math.max(Number(progress.bestStars[currentLevel]) || 0, stars);
            progress.stats.totalWins++;
            progress.stats.totalMoves += moves;
            progress.stats.totalPlayTime += timer;
            progress.stats.bestTime = progress.stats.bestTime === null
                ? timer
                : Math.min(progress.stats.bestTime, timer);
            if (firstCompletion) progress.coins += 10 + stars * 5;
            if (progress.completedLevels.length >= 1) awardAchievement('first-match');
            if (progress.completedLevels.length >= 5) awardAchievement('five-levels');
            if (progress.completedLevels.length >= 10) awardAchievement('ten-levels');
            if (moves === totalPairs) awardAchievement('perfect-level');
            if (progress.completedLevels.length === LEVELS.length) awardAchievement('all-levels');
            saveProgress();
            updateHomeProgress();
            document.getElementById('win-best').textContent = progress.bestScores[currentLevel];
            renderLevels();
            document.getElementById('next-level-button').hidden = currentLevel >= LEVELS.length;

            playWinSound();

            document.getElementById('win-time').textContent = formatTime(timer);
            document.getElementById('win-moves').textContent = moves;
            document.getElementById('win-combo').textContent = `x${bestCombo}`;
            document.getElementById('win-stars').textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
            document.getElementById('win-score').textContent = score;

            const generation = gameGeneration;
            setTimeout(() => {
                if (generation !== gameGeneration) return;
                winOverlay.classList.add('show');
                createConfetti();
            }, 200);
        }

        /* ============================
           Match Particle Effects
           ============================ */
        /* Presentation effects: particles, confetti, combo feedback, and stats. */
        function createMatchParticles(cardEl) {
            const rect = cardEl.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const colors = ['#FFD700', '#FF80AB', '#4FC3F7', '#00E5FF', '#81C784', '#FFD54F', '#FF4081'];
            const count = 14;

            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
                const distance = 50 + Math.random() * 90;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                const color = colors[Math.floor(Math.random() * colors.length)];
                const size = 6 + Math.random() * 14;
                const rot = (180 + Math.random() * 360) + 'deg';
                const duration = 0.5 + Math.random() * 0.4;
                const isStar = Math.random() > 0.4;

                particle.style.cssText = `
                    position: fixed;
                    left: ${cx}px;
                    top: ${cy}px;
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    ${isStar
                        ? `clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);`
                        : `border-radius: 50%;`
                    }
                    z-index: 1000;
                    pointer-events: none;
                    --dx: ${dx}px;
                    --dy: ${dy}px;
                    --rot: ${rot};
                    animation: particleBurst ${duration}s ease-out forwards;
                `;

                document.body.appendChild(particle);
                setTimeout(() => particle.remove(), duration * 1000 + 50);
            }
        }

        /* ============================
           Confetti
           ============================ */
        function createConfetti() {
            const container = document.getElementById('confetti-container');
            container.innerHTML = '';
            const colors = ['#FFD700', '#FF80AB', '#4FC3F7', '#00E5FF', '#81C784', '#FFD54F', '#FF4081', '#CE93D8', '#EF5350'];

            for (let i = 0; i < 60; i++) {
                const piece = document.createElement('div');
                const color = colors[Math.floor(Math.random() * colors.length)];
                const size = 6 + Math.random() * 10;
                const left = Math.random() * 100;
                const delay = Math.random() * 2;
                const duration = 2.5 + Math.random() * 2;
                const spin = (360 + Math.random() * 720) + 'deg';
                const shapes = ['50%', '0%', '3px'];
                const shape = shapes[Math.floor(Math.random() * shapes.length)];

                piece.style.cssText = `
                    position: absolute;
                    left: ${left}%;
                    top: -20px;
                    width: ${size}px;
                    height: ${size * (0.6 + Math.random() * 0.8)}px;
                    background: ${color};
                    border-radius: ${shape};
                    z-index: 201;
                    pointer-events: none;
                    --spin: ${spin};
                    animation: confettiFall ${duration}s linear ${delay}s infinite;
                `;

                container.appendChild(piece);
            }
        }

        /* ============================
           Combo Display
           ============================ */
        function showCombo(level) {
            comboTextEl.textContent = `Combo x${level}!`;
            comboTextEl.classList.remove('show');
            void comboTextEl.offsetWidth;
            comboTextEl.classList.add('show');
            setTimeout(() => comboTextEl.classList.remove('show'), 950);
        }

        /* ============================
           UI Updates
           ============================ */
        function updateDisplays() {
            document.getElementById('moves-display').textContent = moves;
            document.getElementById('score-display').textContent = score;
            document.getElementById('pairs-display').textContent = `${matchedCount}/${totalPairs}`;
            const hintButton = document.getElementById('hint-button');
            hintButton.textContent = `💡 Hint · ${progress.hintCredits} left`;
            hintButton.disabled = isLocked || flippedIndices.length > 0 || progress.hintCredits < 1;
            document.getElementById('coins-display').textContent = progress.coins;
            const extraTimeButton = document.getElementById('extra-time-button');
            extraTimeButton.textContent = `⏱ +60 sec · ${progress.powerups.extraTime}`;
            extraTimeButton.disabled = isLocked || progress.powerups.extraTime < 1 || timeRemaining < 1;
            const revealButton = document.getElementById('reveal-button');
            revealButton.textContent = `👀 Reveal · ${progress.powerups.reveal}`;
            revealButton.disabled = isLocked || flippedIndices.length > 0
                || hintTimeout !== null || progress.powerups.reveal < 1;
            const undoButton = document.getElementById('undo-button');
            undoButton.textContent = `↩ Undo · ${progress.powerups.undo}`;
            undoButton.disabled = isLocked || !lastMismatchAvailable || progress.powerups.undo < 1;
        }

        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        /* Bootstrap the level menu and register the offline app shell. */
        audioPreferences.sound = settings.sound;
        audioPreferences.music = settings.music;
        document.getElementById('sound-setting').checked = settings.sound;
        document.getElementById('music-setting').checked = settings.music;
        document.getElementById('animations-setting').checked = settings.animations;
        document.getElementById('theme-setting').value = settings.theme;
        document.getElementById('custom-audio-settings').hidden = !settings.sound;
        document.body.dataset.theme = settings.theme;
        document.body.dataset.animations = settings.animations ? 'on' : 'off';
        document.body.dataset.cardBack = progress.selectedCardBack;
        applyAccessibilitySettings();
        claimDailyStreakReward();
        restoreCustomMusic();
        restoreCustomBackground();
        document.body.dataset.cardBack = progress.selectedCardBack;
        restoreSelectedCardBack();
        renderLevels();

        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('service-worker.js')
                    .catch(error => console.warn('The app could not be made available offline.', error));
            });
        }

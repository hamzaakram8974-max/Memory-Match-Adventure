const ICONS = [
    { emoji: '🐱', bg: '#FF80AB', name: 'Cat' }, { emoji: '🐶', bg: '#FFB74D', name: 'Dog' },
    { emoji: '🦁', bg: '#FFE082', name: 'Lion' }, { emoji: '🐯', bg: '#FFB74D', name: 'Tiger' },
    { emoji: '🦊', bg: '#FF8A65', name: 'Fox' }, { emoji: '🐼', bg: '#CFD8DC', name: 'Panda' },
    { emoji: '🐨', bg: '#B0BEC5', name: 'Koala' }, { emoji: '🐰', bg: '#F8BBD0', name: 'Rabbit' },
    { emoji: '🐻', bg: '#A1887F', name: 'Bear' }, { emoji: '🐸', bg: '#A5D6A7', name: 'Frog' },
    { emoji: '🐵', bg: '#D7CCC8', name: 'Monkey' }, { emoji: '🦄', bg: '#E1BEE7', name: 'Unicorn' },
    { emoji: '🦉', bg: '#BCAAA4', name: 'Owl' }, { emoji: '🦋', bg: '#80DEEA', name: 'Butterfly' },
    { emoji: '🐝', bg: '#FFF59D', name: 'Honeybee' }, { emoji: '🐬', bg: '#80DEEA', name: 'Dolphin' },
    { emoji: '🐙', bg: '#F8BBD0', name: 'Octopus' }, { emoji: '🐘', bg: '#B0BEC5', name: 'Elephant' },
    { emoji: '🦒', bg: '#FFE082', name: 'Giraffe' }, { emoji: '🐧', bg: '#80DEEA', name: 'Penguin' },
    { emoji: '🍎', bg: '#EF9A9A', name: 'Apple' }, { emoji: '🍌', bg: '#FFF59D', name: 'Banana' },
    { emoji: '🍕', bg: '#FFCC80', name: 'Pizza' }, { emoji: '🍔', bg: '#FFB74D', name: 'Burger' },
    { emoji: '🍦', bg: '#F8BBD0', name: 'Ice cream' }, { emoji: '🍩', bg: '#D1C4E9', name: 'Donut' },
    { emoji: '🥑', bg: '#C8E6C9', name: 'Avocado' }, { emoji: '🍉', bg: '#FFAB91', name: 'Watermelon' },
    { emoji: '🍣', bg: '#FFCDD2', name: 'Sushi' }, { emoji: '🍓', bg: '#FF8A80', name: 'Strawberry' },
    { emoji: '🎂', bg: '#F48FB1', name: 'Birthday cake' }, { emoji: '😀', bg: '#FFE082', name: 'Smile' },
    { emoji: '😎', bg: '#FFE082', name: 'Cool' }, { emoji: '🥳', bg: '#EA80FC', name: 'Party' },
    { emoji: '🤖', bg: '#B0BEC5', name: 'Robot' }, { emoji: '👻', bg: '#E0E0E0', name: 'Ghost' },
    { emoji: '👽', bg: '#C8E6C9', name: 'Alien' }, { emoji: '⚽', bg: '#E0E0E0', name: 'Soccer' },
    { emoji: '🏀', bg: '#FFCC80', name: 'Basketball' }, { emoji: '🎸', bg: '#BCAAA4', name: 'Guitar' },
    { emoji: '🎮', bg: '#9FA8DA', name: 'Gamepad' }, { emoji: '🚀', bg: '#90CAF9', name: 'Rocket' },
    { emoji: '🚗', bg: '#FF8A80', name: 'Car' }, { emoji: '🎁', bg: '#EA80FC', name: 'Gift' },
    { emoji: '💎', bg: '#80DEEA', name: 'Gem' }, { emoji: '📚', bg: '#A5D6A7', name: 'Books' },
    { emoji: '☀️', bg: '#FFF59D', name: 'Sun' }, { emoji: '🌙', bg: '#9FA8DA', name: 'Moon' },
    { emoji: '🌈', bg: '#B388FF', name: 'Rainbow' }, { emoji: '🔥', bg: '#FF8A65', name: 'Fire' },
    { emoji: '⭐', bg: '#FFE082', name: 'Star' }, { emoji: '❄️', bg: '#80DEEA', name: 'Snowflake' },
    { emoji: '🌸', bg: '#F8BBD0', name: 'Blossom' }, { emoji: '🌻', bg: '#FFE082', name: 'Sunflower' },
    { emoji: '🌊', bg: '#80DEEA', name: 'Wave' }, { emoji: '❤️', bg: '#FF8A80', name: 'Heart' },
    { emoji: '✨', bg: '#FFE082', name: 'Sparkles' }, { emoji: '🎉', bg: '#EA80FC', name: 'Confetti' },
];

const setupPanel = document.getElementById('setup-panel');
const gamePanel = document.getElementById('game-panel');
const resultPanel = document.getElementById('result-panel');
const gameGrid = document.getElementById('multiplayer-grid');

const PLAYER_EMOJIS = [
    ['🐯', 'Tiger'], ['🐼', 'Panda'], ['🦊', 'Fox'], ['🐸', 'Frog'],
    ['🦄', 'Unicorn'], ['🐙', 'Octopus'], ['🐬', 'Dolphin'], ['🐻', 'Bear'],
    ['🦉', 'Owl'], ['🐵', 'Monkey'], ['🐰', 'Rabbit'], ['🦋', 'Butterfly'],
];
const SETUP_COPY = {
    1: 'First, choose how many players are joining.',
    2: 'Choose a name and an emoji for each player.',
    3: 'Choose the number of pairs for your random board.',
};

let players = [];
let activePlayer = 0;
let deck = [];
let flippedCards = [];
let locked = false;
let boardNumber = 0;
let turnNumber = 0;
let lastBoardSignature = '';
let setupStep = 1;

function secureRandomIndex(max) {
    if (max < 1) throw new RangeError('Random choice range must be positive.');
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / max) * max;
    const values = new Uint32Array(1);
    do {
        crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % max;
}

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
        const other = secureRandomIndex(index + 1);
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

function makeBoard(pairCount) {
    let board;
    let signature;
    do {
        const selected = shuffle(ICONS).slice(0, pairCount);
        board = shuffle(selected.flatMap(icon => [
            { ...icon, cardId: crypto.randomUUID() },
            { ...icon, cardId: crypto.randomUUID() },
        ]));
        signature = board.map(card => card.emoji).join('|');
    } while (signature === lastBoardSignature);
    lastBoardSignature = signature;
    return board;
}

function renderPlayerDetails() {
    const count = Number(document.querySelector('input[name="player-count"]:checked').value);
    const container = document.getElementById('player-details-fields');
    container.replaceChildren();
    for (let index = 0; index < count; index++) {
        const card = document.createElement('section');
        card.className = 'player-setup-card';
        const heading = document.createElement('h3');
        heading.textContent = `Player ${index + 1}`;
        const nameLabel = document.createElement('label');
        nameLabel.className = 'player-name-label';
        nameLabel.htmlFor = `player-name-${index + 1}`;
        nameLabel.textContent = 'Name';
        const nameInput = document.createElement('input');
        nameInput.id = `player-name-${index + 1}`;
        nameInput.maxLength = 18;
        nameInput.autocomplete = 'off';
        nameInput.value = `Player ${index + 1}`;
        nameInput.required = true;
        nameLabel.appendChild(nameInput);

        const emojiLabel = document.createElement('label');
        emojiLabel.className = 'player-emoji-label';
        emojiLabel.htmlFor = `player-emoji-${index + 1}`;
        emojiLabel.textContent = 'Choose your emoji';
        const emojiSelect = document.createElement('select');
        emojiSelect.id = `player-emoji-${index + 1}`;
        emojiSelect.setAttribute('aria-label', `Player ${index + 1} emoji`);
        PLAYER_EMOJIS.forEach(([emoji, label], emojiIndex) => {
            const option = document.createElement('option');
            option.value = emoji;
            option.textContent = `${emoji} ${label}`;
            option.selected = emojiIndex === index;
            emojiSelect.appendChild(option);
        });
        emojiLabel.appendChild(emojiSelect);
        card.append(heading, nameLabel, emojiLabel);
        container.appendChild(card);
    }
}

function showSetupStep(step) {
    setupStep = step;
    for (let index = 1; index <= 3; index++) {
        document.getElementById(`setup-step-${index}`).hidden = index !== step;
        const marker = document.querySelector(`[data-setup-step="${index}"]`);
        marker.classList.toggle('is-active', index === step);
        marker.classList.toggle('is-complete', index < step);
    }
    document.getElementById('setup-description').textContent = SETUP_COPY[step];
}

function getPlayers() {
    const count = Number(document.querySelector('input[name="player-count"]:checked').value);
    return Array.from({ length: count }, (_, index) => {
        const enteredName = document.getElementById(`player-name-${index + 1}`).value.trim();
        const emoji = document.getElementById(`player-emoji-${index + 1}`).value;
        return {
            name: enteredName || `Player ${index + 1}`,
            emoji,
            score: 0,
            pairs: 0,
            turns: 0,
        };
    });
}

function currentPlayer() {
    return players[activePlayer];
}

function renderScoreboard() {
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.replaceChildren();
    players.forEach((player, index) => {
        const item = document.createElement('article');
        item.className = `score-player${index === activePlayer ? ' is-current' : ''}`;
        item.setAttribute('aria-current', index === activePlayer ? 'true' : 'false');
        const emoji = document.createElement('span');
        emoji.className = 'score-player-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        emoji.textContent = player.emoji;
        const name = document.createElement('span');
        name.className = 'score-player-name';
        name.textContent = player.name;
        const score = document.createElement('strong');
        score.className = 'score-player-score';
        score.textContent = `${player.score}`;
        const pairs = document.createElement('span');
        pairs.className = 'score-player-pairs';
        pairs.textContent = `${player.pairs} ${player.pairs === 1 ? 'pair' : 'pairs'} · ${player.turns} turns`;
        item.append(emoji, name, score, pairs);
        scoreboard.appendChild(item);
    });
    document.getElementById('turn-status').textContent =
        `${currentPlayer().name} · Your turn${flippedCards.length ? ' — choose one more card' : ' — choose two cards'}`;
}

function renderBoard() {
    gameGrid.replaceChildren();
    deck.forEach((card, index) => {
        const tile = document.createElement('button');
        tile.className = 'multiplayer-card';
        tile.type = 'button';
        tile.setAttribute('role', 'gridcell');
        tile.setAttribute('aria-label', `Card ${index + 1}, face down`);
        tile.dataset.index = `${index}`;
        tile.innerHTML = `
            <div class="card">
                <div class="card-face card-back"><div class="card-back-pattern"></div></div>
                <div class="card-face card-front">
                    <div class="card-icon-circle" style="background:${card.bg}">
                        <span class="card-icon">${card.emoji}</span>
                    </div>
                </div>
            </div>`;
        tile.addEventListener('click', () => flipCard(index));
        gameGrid.appendChild(tile);
    });
    gameGrid.classList.toggle('dense', deck.length > 20);
    requestAnimationFrame(() => requestAnimationFrame(fitBoardToViewport));
}

function fitBoardToViewport() {
    if (gamePanel.hidden || !deck.length) return;
    const cardCount = deck.length;
    const style = getComputedStyle(gameGrid);
    const columnGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const availableWidth = gameGrid.clientWidth;
    const availableHeight = gameGrid.clientHeight;
    if (!availableWidth || !availableHeight) return;

    let bestColumns = 1;
    let bestScore = 0;
    const maxColumns = Math.min(cardCount, 10);
    for (let columns = 1; columns <= maxColumns; columns++) {
        const rows = Math.ceil(cardCount / columns);
        const cardWidth = (availableWidth - columnGap * (columns - 1)) / columns;
        const cardHeight = (availableHeight - rowGap * (rows - 1)) / rows;
        const score = Math.min(cardWidth, cardHeight * 0.82);
        if (score > bestScore) {
            bestColumns = columns;
            bestScore = score;
        }
    }
    const rows = Math.ceil(cardCount / bestColumns);
    gameGrid.style.gridTemplateColumns = `repeat(${bestColumns}, minmax(0, 1fr))`;
    gameGrid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
}

function beginMatch(useNewPlayers = true) {
    if (useNewPlayers) players = getPlayers();
    const pairCount = Number(document.getElementById('pair-count').value);
    if (!Number.isInteger(pairCount) || pairCount < 4 || pairCount > 16) {
        document.getElementById('round-status').textContent = 'Choose between 4 and 16 pairs.';
        return;
    }
    activePlayer = 0;
    flippedCards = [];
    locked = false;
    turnNumber = 0;
    deck = makeBoard(pairCount);
    boardNumber++;
    document.getElementById('board-label').textContent =
        `Random board ${boardNumber} · ${pairCount} pairs`;
    document.getElementById('round-status').textContent =
        'Find a pair to score and keep your turn. A mismatch passes the turn.';
    setupPanel.hidden = true;
    resultPanel.hidden = true;
    gamePanel.hidden = false;
    document.body.classList.add('is-playing');
    gamePanel.style.setProperty('--player-count', `${players.length}`);
    renderBoard();
    renderScoreboard();
}

function flipCard(index) {
    if (locked) return;
    const tile = gameGrid.children[index];
    if (!tile || tile.disabled || tile.classList.contains('is-flipped')) return;

    tile.classList.add('is-flipped');
    tile.setAttribute('aria-label', `Card ${index + 1}, ${deck[index].name}`);
    tile.disabled = true;
    flippedCards.push({ index, cardId: deck[index].cardId });

    if (flippedCards.length === 1) {
        document.getElementById('round-status').textContent = 'One card open — choose a second card.';
        renderScoreboard();
        return;
    }

    locked = true;
    currentPlayer().turns++;
    turnNumber++;
    const [first, second] = flippedCards;
    const isMatch = deck[first.index].emoji === deck[second.index].emoji;
    document.getElementById('round-status').textContent = isMatch
        ? `${currentPlayer().name} found a pair!`
        : 'Not a match. Cards will turn over before the next player.';

    window.setTimeout(() => {
        if (isMatch) {
            [first, second].forEach(({ index }) => {
                const matched = gameGrid.children[index];
                matched.classList.add('is-matched');
                matched.setAttribute('aria-label', `Card ${index + 1}, matched ${deck[index].name}`);
            });
            currentPlayer().pairs++;
            currentPlayer().score += 100;
            flippedCards = [];
            locked = false;
            if (currentPlayer().pairs === deck.length / 2) {
                finishMatch();
                return;
            }
            document.getElementById('round-status').textContent =
                `${currentPlayer().name} scored 100+ points and keeps the turn. Find another pair!`;
            renderScoreboard();
            return;
        }

        [first, second].forEach(({ index }) => {
            const missed = gameGrid.children[index];
            missed.classList.remove('is-flipped');
            missed.disabled = false;
            missed.setAttribute('aria-label', `Card ${index + 1}, face down`);
        });
        flippedCards = [];
        activePlayer = (activePlayer + 1) % players.length;
        locked = false;
        renderScoreboard();
        document.getElementById('round-status').textContent =
            `${currentPlayer().name} ${currentPlayer().emoji} — your turn. Choose two cards.`;
    }, isMatch ? 650 : 1050);
}

function finishMatch() {
    locked = true;
    gamePanel.hidden = true;
    resultPanel.hidden = false;
    const rankings = [...players].sort((first, second) =>
        second.score - first.score || first.turns - second.turns);
    const highestScore = rankings[0].score;
    const fewestWinningTurns = rankings[0].turns;
    const winners = rankings.filter(player =>
        player.score === highestScore && player.turns === fewestWinningTurns);
    document.getElementById('result-title').textContent = winners.length > 1
        ? 'It’s a tie!'
        : `${winners[0].name} wins!`;
    document.getElementById('result-summary').textContent =
        `${deck.length / 2} pairs · ${turnNumber} turns · ties are broken by fewest turns`;
    const scoreboard = document.getElementById('final-scoreboard');
    scoreboard.replaceChildren();
    rankings.forEach((player, index) => {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'final-rank';
        rank.setAttribute('aria-hidden', 'true');
        rank.textContent = ['🥇', '🥈', '🥉'][index];
        const name = document.createElement('span');
        name.className = 'final-player-name';
        name.textContent = `${player.emoji} ${player.name}`;
        const score = document.createElement('span');
        score.className = 'final-player-score';
        score.textContent = `${player.score} pts`;
        const details = document.createElement('small');
        details.textContent = `${player.pairs} pairs · ${player.turns} turns`;
        score.appendChild(details);
        item.append(rank, name, score);
        scoreboard.appendChild(item);
    });
}

document.getElementById('pair-count').addEventListener('input', event => {
    document.getElementById('pair-count-output').value = event.target.value;
    document.getElementById('pair-count-output').textContent = event.target.value;
});
document.getElementById('players-next-button').addEventListener('click', () => {
    const playerCountChoice = document.querySelector('input[name="player-count"]:checked');
    if (!playerCountChoice) {
        document.querySelector('input[name="player-count"]').reportValidity();
        return;
    }
    renderPlayerDetails();
    showSetupStep(2);
    document.getElementById('player-name-1').focus();
});
document.getElementById('details-next-button').addEventListener('click', () => {
    const nameFields = document.querySelectorAll('#player-details-fields input');
    const emptyField = [...nameFields].find(input => !input.value.trim());
    if (emptyField) {
        emptyField.setCustomValidity('Enter a player name.');
        emptyField.reportValidity();
        emptyField.focus();
        return;
    }
    nameFields.forEach(input => input.setCustomValidity(''));
    showSetupStep(3);
});
document.querySelectorAll('[data-setup-back]').forEach(button => {
    button.addEventListener('click', () => showSetupStep(Number(button.dataset.setupBack)));
});
document.getElementById('start-match-button').addEventListener('click', () => beginMatch(true));
document.getElementById('new-board-button').addEventListener('click', () => {
    if (window.confirm('Start a fresh random board? The current match scores will be cleared.')) beginMatch(false);
});
document.getElementById('rematch-button').addEventListener('click', () => beginMatch(false));
document.getElementById('back-to-setup-button').addEventListener('click', () => {
    document.body.classList.remove('is-playing');
    resultPanel.hidden = true;
    setupPanel.hidden = false;
    showSetupStep(1);
});
window.addEventListener('resize', fitBoardToViewport);
if ('ResizeObserver' in window) {
    const boardResizeObserver = new ResizeObserver(fitBoardToViewport);
    boardResizeObserver.observe(gameGrid);
    boardResizeObserver.observe(gamePanel);
}

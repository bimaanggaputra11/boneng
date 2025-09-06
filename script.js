// Global variables
let wheelSlots = Array(50).fill(null);
let queueList = [];
let winnersList = [];
let currentUser = null;
let spinInterval = null;
let timeRemaining = 15 * 60; // 15 minutes in seconds

// Token mint address
const TOKEN_MINT = "ACbRrERR5GJnADhLhhanxrDCXJzGhyF64SKihbzBpump";

// Save all data to localStorage
function saveData() {
    localStorage.setItem("wheelSlots", JSON.stringify(wheelSlots));
    localStorage.setItem("queueList", JSON.stringify(queueList));
    localStorage.setItem("winnersList", JSON.stringify(winnersList));
    localStorage.setItem("currentUser", currentUser || "");
}

// Load data from localStorage
function loadData() {
    const storedSlots = localStorage.getItem("wheelSlots");
    const storedQueue = localStorage.getItem("queueList");
    const storedWinners = localStorage.getItem("winnersList");
    const savedUser = localStorage.getItem("currentUser");

    if (storedSlots) wheelSlots = JSON.parse(storedSlots);
    if (storedQueue) queueList = JSON.parse(storedQueue);
    if (storedWinners) winnersList = JSON.parse(storedWinners);
    if (savedUser) currentUser = savedUser;
}

// Initialize wheel grid
function initializeWheel() {
    const wheelGrid = document.getElementById('wheelGrid');
    wheelGrid.innerHTML = '';

    for (let i = 0; i < 50; i++) {
        const slot = document.createElement('div');
        slot.className = 'wheel-slot';
        slot.id = `slot-${i}`;

        if (wheelSlots[i]) {
            slot.classList.add('filled');
            slot.textContent = formatAddress(wheelSlots[i]);
        } else {
            slot.textContent = `Slot ${i + 1}`;
        }

        wheelGrid.appendChild(slot);
    }
}

// Format address to show first and last few characters
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 3)}`;
}

// Validate if user is token holder
async function validateHolder(address) {
    try {
        const response = await fetch('https://mainnet.helius-rpc.com/?api-key=c93e5dea-5c54-48b4-bb7a-9b9aef4cc41c', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    address,
                    { mint: TOKEN_MINT },
                    { encoding: 'jsonParsed' }
                ]
            })
        });

        const data = await response.json();

        if (data.result && data.result.value && data.result.value.length > 0) {
            for (const tokenAccount of data.result.value) {
                const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
                if (balance > 0) {
                    return true;
                }
            }
        }

        return false;

    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

// Validate user input address
async function validateAddress() {
    const addressInput = document.getElementById('walletAddress');
    const messageDiv = document.getElementById('message');
    const address = addressInput.value.trim();

    messageDiv.innerHTML = '';

    if (!address) {
        showMessage('Please enter a wallet address', 'error');
        return;
    }

    if (address.length < 32 || address.length > 44) {
        showMessage('Invalid wallet address format', 'error');
        return;
    }

    showMessage('Validating token holder status...', 'info');

    try {
        const isHolder = await validateHolder(address);

        if (isHolder) {
            currentUser = address;
            localStorage.setItem("isValidUser", "true");
            localStorage.setItem("currentUser", currentUser);

            showMessage('✅ Verification successful! Entering Lucky Wheel...', 'success');
            setTimeout(() => {
                enterWheel();
            }, 1500);
        } else {
            showMessage('❌ You are not a token holder. Access denied.', 'error');
        }
    } catch (error) {
        showMessage('❌ Validation failed. Please try again.', 'error');
    }
}

// Show message
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    const className = type === 'error' ? 'error-message' :
        type === 'success' ? 'success-message' : 'info-message';
    messageDiv.innerHTML = `<div class="${className}">${text}</div>`;
}

// Enter the wheel page
function enterWheel() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('wheelPage').style.display = 'block';

    addUserToSystem(currentUser);
    startTimer();
    updateDisplay();
    saveData();
}

// Add user to system
function addUserToSystem(address) {
    if (wheelSlots.includes(address) || queueList.includes(address)) return;

    const emptySlotIndex = wheelSlots.findIndex(slot => slot === null);
    if (emptySlotIndex !== -1) {
        wheelSlots[emptySlotIndex] = address;
    } else {
        queueList.push(address);
    }

    updateDisplay();
    saveData();
}

// Update wheel UI
function updateDisplay() {
    initializeWheel();
    updateStats();
    updateQueue();
    updateWinners();
}

// Stats UI
function updateStats() {
    const filledSlots = wheelSlots.filter(slot => slot !== null).length;
    document.getElementById('currentParticipants').textContent = filledSlots;
    document.getElementById('queueSize').textContent = queueList.length;
    document.getElementById('totalWinners').textContent = winnersList.length;
}

// Queue UI
function updateQueue() {
    const queueDiv = document.getElementById('queueList');
    queueDiv.innerHTML = queueList.length === 0
        ? '<p style="color: #999; font-style: italic;">No addresses in queue</p>'
        : queueList.map(addr => `<span class="address-tag">${formatAddress(addr)}</span>`).join('');
}

// Winners UI
function updateWinners() {
    const winnersDiv = document.getElementById('winnersList');
    winnersDiv.innerHTML = winnersList.length === 0
        ? '<p style="color: #999; font-style: italic;">No winners yet</p>'
        : winnersList.slice(-10).map(winner =>
            `<span class="address-tag winner">${formatAddress(winner)}</span>`
        ).join('');
}

// Countdown to next spin
function startTimer() {
    if (spinInterval) clearInterval(spinInterval);

    spinInterval = setInterval(() => {
        timeRemaining--;

        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        document.getElementById('nextSpinTimer').textContent = timeString;
        document.getElementById('spinTimer').textContent = `Next spin in: ${timeString}`;

        if (timeRemaining <= 0) {
            performSpin();
            timeRemaining = 15 * 60;
        }
    }, 1000);
}

// Spin and select winner
function performSpin() {
    const filledSlots = wheelSlots.filter(slot => slot !== null);
    if (filledSlots.length === 0) return;

    document.getElementById('wheelGrid').classList.add('spinning');

    setTimeout(() => {
        const winnerIndex = Math.floor(Math.random() * filledSlots.length);
        const winner = filledSlots[winnerIndex];
        winnersList.push(winner);

        const wheelIndex = wheelSlots.indexOf(winner);
        wheelSlots[wheelIndex] = null;

        if (queueList.length > 0) {
            const nextParticipant = queueList.shift();
            wheelSlots[wheelIndex] = nextParticipant;
        }

        setTimeout(() => {
            const winnerSlot = document.getElementById(`slot-${wheelIndex}`);
            if (winnerSlot) {
                winnerSlot.classList.add('winner');
                setTimeout(() => {
                    winnerSlot.classList.remove('winner');
                    updateDisplay();
                }, 3000);
            }
        }, 100);

        document.getElementById('wheelGrid').classList.remove('spinning');
        updateDisplay();
        saveData();

        alert(`🎉 Congratulations! Winner: ${formatAddress(winner)}`);
    }, 3000);
}

// Logout (optional)
function logout() {
    localStorage.clear();
    location.reload();
}

// DOM Ready
document.addEventListener('DOMContentLoaded', function () {
    loadData();

    const isValidUser = localStorage.getItem("isValidUser");
    const savedUser = localStorage.getItem("currentUser");

    if (isValidUser === "true" && savedUser) {
        currentUser = savedUser;
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('wheelPage').style.display = 'block';
        addUserToSystem(currentUser);
        startTimer();
    }

    initializeWheel();
    updateDisplay();

    document.getElementById('walletAddress').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            validateAddress();
        }
    });
});

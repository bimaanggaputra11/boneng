// Global variables
let wheelSlots = Array(50).fill(null);
let queueList = [];
let winnersList = [];
let currentUser = null;
let spinInterval = null;
let timeRemaining = 15 * 60; // 15 minutes in seconds

// Token mint address - you can change this
const TOKEN_MINT = "YOUR_TOKEN_MINT_ADDRESS_HERE";

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

// Format address to show first 3 and last 3 characters
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 3)}`;
}

// Validate holder function - you can implement your Helius logic here
async function validateHolder(address) {
    // This is where you'll implement the Helius RPC call
    
    try {
        // TODO: Replace with actual Helius RPC call
        const response = await fetch('https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY', {
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
                    {
                        mint: TOKEN_MINT
                    },
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });
        
        const data = await response.json();
        
        // Check if user has the token
        if (data.result && data.result.value && data.result.value.length > 0) {
            // Optional: Check if balance > 0
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
        
        // For development/testing only - remove this in production
        // This simulates validation with 50% success rate
        console.warn('Using demo validation - remove this in production!');
        return Math.random() > 0.5;
    }
}

// Validate address input
async function validateAddress() {
    const addressInput = document.getElementById('walletAddress');
    const messageDiv = document.getElementById('message');
    const address = addressInput.value.trim();
    
    messageDiv.innerHTML = '';
    
    if (!address) {
        showMessage('Please enter a wallet address', 'error');
        return;
    }
    
    // Basic Solana address format validation
    if (address.length < 32 || address.length > 44) {
        showMessage('Invalid wallet address format', 'error');
        return;
    }
    
    showMessage('Validating token holder status...', 'info');
    
    try {
        const isHolder = await validateHolder(address);
        
        if (isHolder) {
            currentUser = address;
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

// Enter wheel system
function enterWheel() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('wheelPage').style.display = 'block';
    
    addUserToSystem(currentUser);
    startTimer();
}

// Add user to wheel or queue
function addUserToSystem(address) {
    // Check if user is already in wheel or queue
    if (wheelSlots.includes(address) || queueList.includes(address)) {
        return;
    }
    
    // Find empty slot
    const emptySlotIndex = wheelSlots.findIndex(slot => slot === null);
    
    if (emptySlotIndex !== -1) {
        // Add to wheel
        wheelSlots[emptySlotIndex] = address;
    } else {
        // Add to queue
        queueList.push(address);
    }
    
    updateDisplay();
}

// Update display
function updateDisplay() {
    initializeWheel();
    updateStats();
    updateQueue();
    updateWinners();
}

// Update stats
function updateStats() {
    const filledSlots = wheelSlots.filter(slot => slot !== null).length;
    document.getElementById('currentParticipants').textContent = filledSlots;
    document.getElementById('queueSize').textContent = queueList.length;
    document.getElementById('totalWinners').textContent = winnersList.length;
}

// Update queue display
function updateQueue() {
    const queueDiv = document.getElementById('queueList');
    
    if (queueList.length === 0) {
        queueDiv.innerHTML = '<p style="color: #999; font-style: italic;">No addresses in queue</p>';
    } else {
        queueDiv.innerHTML = queueList.map(address => 
            `<span class="address-tag">${formatAddress(address)}</span>`
        ).join('');
    }
}

// Update winners display
function updateWinners() {
    const winnersDiv = document.getElementById('winnersList');
    
    if (winnersList.length === 0) {
        winnersDiv.innerHTML = '<p style="color: #999; font-style: italic;">No winners yet</p>';
    } else {
        winnersDiv.innerHTML = winnersList.slice(-10).map(winner => 
            `<span class="address-tag winner">${formatAddress(winner)}</span>`
        ).join('');
    }
}

// Start countdown timer
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
            timeRemaining = 15 * 60; // Reset to 15 minutes
        }
    }, 1000);
}

// Perform wheel spin
function performSpin() {
    const filledSlots = wheelSlots.filter(slot => slot !== null);
    
    if (filledSlots.length === 0) {
        return; // No participants
    }
    
    // Add spinning animation
    document.getElementById('wheelGrid').classList.add('spinning');
    
    setTimeout(() => {
        // Select random winner
        const winnerIndex = Math.floor(Math.random() * filledSlots.length);
        const winner = filledSlots[winnerIndex];
        
        // Add winner to winners list
        winnersList.push(winner);
        
        // Remove winner from wheel
        const wheelIndex = wheelSlots.indexOf(winner);
        wheelSlots[wheelIndex] = null;
        
        // Fill empty slot from queue
        if (queueList.length > 0) {
            const nextParticipant = queueList.shift();
            wheelSlots[wheelIndex] = nextParticipant;
        }
        
        // Highlight winner slot temporarily
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
        
        // Show winner announcement
        alert(`🎉 Congratulations! Winner: ${formatAddress(winner)}`);
        
    }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Load saved data first
    loadData();
    
    // Initialize display
    initializeWheel();
    updateDisplay();
    
    // Start timer if there are participants
    if (wheelSlots.some(slot => slot !== null)) {
        startTimer();
    }
    
    // Allow Enter key to validate address
    document.getElementById('walletAddress').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            validateAddress();
        }
    });
});
// Import dan inisialisasi Supabase (kalau kamu pake bundler, ini harus di import dari package, kalau di browser pakai script tag terpisah)
const SUPABASE_URL = 'https://bewuevhfiehsjofvwpbi.supabase.co'; // Ganti dengan URL project kamu
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3VldmhmaWVoc2pvZnZ3cGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjA1MDEsImV4cCI6MjA3MjczNjUwMX0.o7KJ4gkbfZKYy3lvuV63yGM5XCnk5xk4vCLv46hNAII'; // Ganti dengan anon key kamu

const supabase = supabase = supabase || null;
if (!supabase) {
    window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
const supabaseClient = window.supabase;

// Global variables
let wheelSlots = Array(50).fill(null);
let queueList = [];
let winnersList = [];
let currentUser = null;
let spinInterval = null;
let timeRemaining = 15 * 60; // 15 minutes in seconds

// Token mint address
const TOKEN_MINT = "ACbRrERR5GJnADhLhhanxrDCXJzGhyF64SKihbzBpump";

// Save all data to Supabase
async function saveData() {
    try {
        // Save wheelSlots (upsert tiap slot)
        for (let i = 0; i < wheelSlots.length; i++) {
            const address = wheelSlots[i];
            await supabaseClient.from('wheel_slots').upsert({
                slot_index: i,
                address: address
            }, { onConflict: 'slot_index' });
        }

        // Save queueList (hapus dulu, baru insert ulang)
        await supabaseClient.from('queue_list').delete();
        for (const addr of queueList) {
            await supabaseClient.from('queue_list').insert({ address: addr });
        }

        // Save winnersList (hanya insert baru)
        // Asumsi winnersList tidak terlalu besar, dan ini akan duplikat, bisa dioptimasi dengan unique constraint di DB
        for (const winner of winnersList) {
            await supabaseClient.from('winners_list').upsert({
                address: winner,
                timestamp: new Date()
            }, { onConflict: ['address', 'timestamp'] });
        }

        // Save currentUser (hanya satu record)
        await supabaseClient.from('current_user').upsert({ id: 1, address: currentUser });

    } catch (error) {
        console.error('Failed to save data to Supabase:', error);
    }
}

// Load data from Supabase
async function loadData() {
    try {
        // Load wheel slots
        let { data: slotsData, error: slotsError } = await supabaseClient
            .from('wheel_slots')
            .select('*')
            .order('slot_index', { ascending: true });

        if (slotsError) throw slotsError;

        wheelSlots = Array(50).fill(null);
        if (slotsData) {
            for (const slot of slotsData) {
                wheelSlots[slot.slot_index] = slot.address;
            }
        }

        // Load queue
        let { data: queueData, error: queueError } = await supabaseClient
            .from('queue_list')
            .select('*')
            .order('id', { ascending: true });

        if (queueError) throw queueError;
        queueList = queueData ? queueData.map(q => q.address) : [];

        // Load winners
        let { data: winnersData, error: winnersError } = await supabaseClient
            .from('winners_list')
            .select('*')
            .order('timestamp', { ascending: true });

        if (winnersError) throw winnersError;
        winnersList = winnersData ? winnersData.map(w => w.address) : [];

        // Load currentUser
        let { data: userData, error: userError } = await supabaseClient
            .from('current_user')
            .select('*')
            .eq('id', 1)
            .limit(1);

        if (userError) throw userError;
        currentUser = userData && userData.length > 0 ? userData[0].address : null;

    } catch (error) {
        console.error('Failed to load data from Supabase:', error);
    }
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
async function enterWheel() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('wheelPage').style.display = 'block';

    addUserToSystem(currentUser);
    startTimer();
    updateDisplay();
    await saveData();
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

    setTimeout(async () => {
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
        await saveData();

        alert(`🎉 Congratulations! Winner: ${formatAddress(winner)}`);
    }, 3000);
}

// Logout
async function logout() {
    try {
        await supabaseClient.from('current_user').delete().eq('id', 1);
        location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// DOM Ready
document.addEventListener('DOMContentLoaded', async function () {
    await loadData();

    if (currentUser) {
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

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// ✅ Import createClient dari CDN (ESM version)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ Konfigurasi Supabase
const SUPABASE_URL = 'https://bewuevhfiehsjofvwpbi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// ✅ Inisialisasi Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Token mint address
const TOKEN_MINT = "ACbRrERR5GJnADhLhhanxrDCXJzGhyF64SKihbzBpump";

// Global variables
let wheelSlots = Array(50).fill(null);
let queueList = [];
let winnersList = [];
let currentUser = null;
let spinInterval = null;
let timeRemaining = 15 * 60;

// SAVE DATA TO SUPABASE
async function saveData() {
    try {
        for (let i = 0; i < wheelSlots.length; i++) {
            const address = wheelSlots[i];
            await supabase.from('wheel_slots').upsert({ slot_index: i, address }, { onConflict: 'slot_index' });
        }

        await supabase.from('queue_list').delete();
        for (const addr of queueList) {
            await supabase.from('queue_list').insert({ address: addr });
        }

        for (const winner of winnersList) {
            await supabase.from('winners_list').upsert({ address: winner, timestamp: new Date() }, { onConflict: ['address', 'timestamp'] });
        }

        await supabase.from('current_user').upsert({ id: 1, address: currentUser });

    } catch (error) {
        console.error('❌ Failed to save data:', error);
    }
}

// LOAD DATA FROM SUPABASE
async function loadData() {
    try {
        let { data: slotsData } = await supabase.from('wheel_slots').select('*').order('slot_index', { ascending: true });
        wheelSlots = Array(50).fill(null);
        for (const slot of slotsData) wheelSlots[slot.slot_index] = slot.address;

        let { data: queueData } = await supabase.from('queue_list').select('*').order('id', { ascending: true });
        queueList = queueData ? queueData.map(q => q.address) : [];

        let { data: winnersData } = await supabase.from('winners_list').select('*').order('timestamp', { ascending: true });
        winnersList = winnersData ? winnersData.map(w => w.address) : [];

        let { data: userData } = await supabase.from('current_user').select('*').eq('id', 1).limit(1);
        currentUser = userData && userData.length > 0 ? userData[0].address : null;

    } catch (error) {
        console.error('❌ Failed to load data:', error);
    }
}

// INISIALISASI SLOT WHEEL
function initializeWheel() {
    const wheelGrid = document.getElementById('wheelGrid');
    wheelGrid.innerHTML = '';

    for (let i = 0; i < 50; i++) {
        const slot = document.createElement('div');
        slot.className = 'wheel-slot';
        slot.id = `slot-${i}`;
        slot.textContent = wheelSlots[i] ? formatAddress(wheelSlots[i]) : `Slot ${i + 1}`;
        if (wheelSlots[i]) slot.classList.add('filled');
        wheelGrid.appendChild(slot);
    }
}

// FORMAT ALAMAT
function formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

// VALIDASI HOLDER TOKEN
async function validateHolder(address) {
    try {
        const res = await fetch('https://mainnet.helius-rpc.com/?api-key=c93e5dea-5c54-48b4-bb7a-9b9aef4cc41c', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [address, { mint: TOKEN_MINT }, { encoding: 'jsonParsed' }]
            })
        });

        const data = await res.json();
        if (data.result?.value?.length > 0) {
            return data.result.value.some(acc => acc.account.data.parsed.info.tokenAmount.uiAmount > 0);
        }

        return false;
    } catch (err) {
        console.error('❌ validateHolder error:', err);
        return false;
    }
}

// VALIDASI ADDRESS
async function validateAddress() {
    const input = document.getElementById('walletAddress');
    const msg = document.getElementById('message');
    const address = input.value.trim();

    msg.innerHTML = '';

    if (!address) return showMessage('Please enter a wallet address', 'error');
    if (address.length < 32 || address.length > 44) return showMessage('Invalid wallet address format', 'error');

    showMessage('Validating token holder status...', 'info');

    const isHolder = await validateHolder(address);
    if (isHolder) {
        currentUser = address;
        showMessage('✅ Verification successful! Entering Lucky Wheel...', 'success');
        setTimeout(() => enterWheel(), 1500);
    } else {
        showMessage('❌ You are not a token holder. Access denied.', 'error');
    }
}

// TAMPILKAN PESAN
function showMessage(text, type) {
    const msg = document.getElementById('message');
    const className = type === 'error' ? 'error-message' :
        type === 'success' ? 'success-message' : 'info-message';
    msg.innerHTML = `<div class="${className}">${text}</div>`;
}

// MASUK KE WHEEL PAGE
async function enterWheel() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('wheelPage').style.display = 'block';

    addUserToSystem(currentUser);
    startTimer();
    updateDisplay();
    await saveData();
}

// TAMBAH USER
function addUserToSystem(address) {
    if (wheelSlots.includes(address) || queueList.includes(address)) return;

    const empty = wheelSlots.findIndex(slot => !slot);
    if (empty !== -1) {
        wheelSlots[empty] = address;
    } else {
        queueList.push(address);
    }

    updateDisplay();
    saveData();
}

// UPDATE TAMPILAN
function updateDisplay() {
    initializeWheel();
    updateStats();
    updateQueue();
    updateWinners();
}

// STATS
function updateStats() {
    document.getElementById('currentParticipants').textContent = wheelSlots.filter(Boolean).length;
    document.getElementById('queueSize').textContent = queueList.length;
    document.getElementById('totalWinners').textContent = winnersList.length;
}

// QUEUE
function updateQueue() {
    const q = document.getElementById('queueList');
    q.innerHTML = queueList.length === 0
        ? '<p style="color: #999; font-style: italic;">No addresses in queue</p>'
        : queueList.map(addr => `<span class="address-tag">${formatAddress(addr)}</span>`).join('');
}

// WINNERS
function updateWinners() {
    const w = document.getElementById('winnersList');
    w.innerHTML = winnersList.length === 0
        ? '<p style="color: #999; font-style: italic;">No winners yet</p>'
        : winnersList.slice(-10).map(w => `<span class="address-tag winner">${formatAddress(w)}</span>`).join('');
}

// TIMER
function startTimer() {
    if (spinInterval) clearInterval(spinInterval);

    spinInterval = setInterval(() => {
        timeRemaining--;
        const min = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
        const sec = (timeRemaining % 60).toString().padStart(2, '0');
        const timeStr = `${min}:${sec}`;
        document.getElementById('nextSpinTimer').textContent = timeStr;
        document.getElementById('spinTimer').textContent = `Next spin in: ${timeStr}`;

        if (timeRemaining <= 0) {
            performSpin();
            timeRemaining = 15 * 60;
        }
    }, 1000);
}

// SPIN!
function performSpin() {
    const filled = wheelSlots.filter(Boolean);
    if (filled.length === 0) return;

    document.getElementById('wheelGrid').classList.add('spinning');

    setTimeout(async () => {
        const winner = filled[Math.floor(Math.random() * filled.length)];
        winnersList.push(winner);

        const index = wheelSlots.indexOf(winner);
        wheelSlots[index] = null;

        if (queueList.length > 0) {
            wheelSlots[index] = queueList.shift();
        }

        setTimeout(() => {
            const slot = document.getElementById(`slot-${index}`);
            if (slot) {
                slot.classList.add('winner');
                setTimeout(() => {
                    slot.classList.remove('winner');
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

// LOGOUT
async function logout() {
    await supabase.from('current_user').delete().eq('id', 1);
    location.reload();
}

// ✅ DOM READY
document.addEventListener('DOMContentLoaded', async () => {
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
        if (e.key === 'Enter') validateAddress();
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
});

// ✅ Expose ke window agar bisa dipakai di HTML onclick
window.validateAddress = validateAddress;
window.logout = logout;

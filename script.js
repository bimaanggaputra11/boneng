import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://bewuevhfiehsjofvwpbi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3VldmhmaWVoc2pvZnZ3cGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjA1MDEsImV4cCI6MjA3MjczNjUwMX0.o7KJ4gkbfZKYy3lvuV63yGM5XCnk5xk4vCLv46hNAII'; // singkat karena panjang

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TOKEN_MINT = "ACbRrERR5GJnADhLhhanxrDCXJzGhyF64SKihbzBpump";

let wheelSlots = Array(50).fill(null);
let queueList = [];
let winnersList = [];
let currentUser = null;
let spinInterval = null;
let timeRemaining = 5 * 60;

// ⏱️ Update countdown dari Supabase
let spinTimestamp = null;

// ✅ Simpan waktu spin ke Supabase
async function updateSpinTimestamp() {
  spinTimestamp = Date.now();
  await supabase.from('settings').upsert([{ key: 'last_spin', value: String(spinTimestamp) }], { onConflict: ['key'] });
}

// ✅ Ambil waktu spin dari Supabase
async function fetchSpinTimestamp() {
  const { data } = await supabase.from('settings').select('*').eq('key', 'last_spin').maybeSingle();
  if (data?.value) {
    spinTimestamp = parseInt(data.value);
    const elapsed = Math.floor((Date.now() - spinTimestamp) / 1000);
    const countdown = 5 * 60 - elapsed;
    timeRemaining = countdown > 0 ? countdown : 0;
  } else {
    // Jika belum ada, inisialisasi
    await updateSpinTimestamp();
    timeRemaining = 5 * 60;
  }
}

async function saveData() {
  try {
    for (let i = 0; i < wheelSlots.length; i++) {
      await supabase.from('wheel_slots').upsert({ slot_index: i, address: wheelSlots[i] }, { onConflict: ['slot_index'] });
    }

    await supabase.from('queue_list').delete().neq('address', '');
    for (const addr of queueList) {
      await supabase.from('queue_list').insert({ address: addr });
    }

    for (const winner of winnersList) {
  await supabase.from('winners_list').upsert(
    { address: winner, timestamp: new Date().toISOString() },
    { onConflict: ['address', 'timestamp'] }
  );
}


    if (currentUser) {
      await supabase.from('current_user').upsert({ id: 1, address: currentUser });
    }
  } catch (error) {
    console.error('❌ Failed to save data:', error);
  }
}

async function loadData() {
  try {
    const { data: slotsData } = await supabase.from('wheel_slots').select('*').order('slot_index', { ascending: true });
    wheelSlots = Array(50).fill(null);
    for (const slot of slotsData) wheelSlots[slot.slot_index] = slot.address;

    const { data: queueData } = await supabase.from('queue_list').select('*').order('id', { ascending: true });
    queueList = queueData ? queueData.map(q => q.address) : [];

    const { data: winnersData } = await supabase.from('winners_list').select('*').order('timestamp', { ascending: true });
    winnersList = winnersData ? winnersData.map(w => w.address) : [];

    const { data: userData } = await supabase.from('current_user').select('address').eq('id', 1).maybeSingle();
    currentUser = userData?.address || null;
  } catch (error) {
    console.error('❌ Failed to load data:', error);
  }
}

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

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

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
    return data.result?.value?.some(acc => acc.account.data.parsed.info.tokenAmount.uiAmount > 0) || false;
  } catch (err) {
    console.error('❌ validateHolder error:', err);
    return false;
  }
}

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
    setTimeout(() => enterWheel(), 500);
  } else {
    showMessage('❌ You are not a token holder. Access denied.', 'error');
  }
}

function showMessage(text, type) {
  const msg = document.getElementById('message');
  const className = type === 'error' ? 'error-message' :
    type === 'success' ? 'success-message' : 'info-message';
  msg.innerHTML = `<div class="${className}">${text}</div>`;
}

async function enterWheel() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('wheelPage').style.display = 'block';

  addUserToSystem(currentUser);
  startTimer();
  updateDisplay();
  await saveData();
}

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

function updateDisplay() {
  initializeWheel();
  updateStats();
  updateQueue();
  updateWinners();
}

function updateStats() {
  document.getElementById('currentParticipants').textContent = wheelSlots.filter(Boolean).length;
  document.getElementById('queueSize').textContent = queueList.length;
  document.getElementById('totalWinners').textContent = winnersList.length;
}

function updateQueue() {
  const q = document.getElementById('queueList');
  q.innerHTML = queueList.length === 0
    ? '<p style="color: #999; font-style: italic;">No addresses in queue</p>'
    : queueList.map(addr => `<span class="address-tag">${formatAddress(addr)}</span>`).join('');
}

function updateWinners() {
  const w = document.getElementById('winnersList');
  w.innerHTML = winnersList.length === 0
    ? '<p style="color: #999; font-style: italic;">No winners yet</p>'
    : winnersList.slice(-10).map(w => `<span class="address-tag winner">${formatAddress(w)}</span>`).join('');
}

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
      timeRemaining = 5 * 60;
    }
  }, 1000);
}

async function performSpin() {
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
    await updateSpinTimestamp();  // ⏱️ Update waktu spin agar semua sinkron
    updateDisplay();
    await saveData();

    alert(`🎉 Congratulations! Winner: ${formatAddress(winner)}`);
  }, 3000);
}

async function logout() {
  await supabase.from('current_user').delete().eq('id', 1);
  location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  await fetchSpinTimestamp(); // Ambil waktu spin dari database

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

// ✅ Expose untuk HTML
window.validateAddress = validateAddress;
window.logout = logout;

// const API_BASE = `https://10.123.134.158:5000`;
const API_BASE = window.location.origin;
// const API_BASE = "https://192.168.1.50:5000";
// const SERVER_URL =
//   localStorage.getItem("zapya_server_ip") || window.location.origin;
// let API_BASE = SERVER_URL;
// const API_BASE = `https://reorder-example-basket.ngrok-free.dev/`;

let selectedDeviceIP = "";
let selectedDeviceName = "";

// 📌 ကိုယ့်ရဲ့ IP Address ကို server ကနေ ဆွဲယူပြီး သိမ်းထားမည့် variable (Filter လုပ်ရန် အသုံးပြုမည်)
let MY_IP = "";
let MY_NAME = localStorage.getItem("my_device_name") || "MyDevice-Phone";

// 📌 [အရေးကြီးဆုံး ဖြည့်စွက်ချက်] - Hotspot IP တူညီနေသော်လည်း စက်များကို တိကျစွာ ခွဲခြားရန် Browser တိုင်းအတွက် Unique ID ဖန်တီးခြင်း
let MY_CLIENT_ID = localStorage.getItem("my_client_id");
if (!MY_CLIENT_ID) {
  MY_CLIENT_ID =
    "client_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
  localStorage.setItem("my_client_id", MY_CLIENT_ID);
}

// 📌 Server ကမိထားသော Bluetooth/Network Peers များအား ယာယီသိမ်းဆည်းထားမည့် Variable
let latestPeers = [];

// 📌 ဝင်ပြီးသား အရေးပေါ်စာများကို ထပ်ခါထပ်ခါ Noti မပြစေရန် ID များကို သိမ်းဆည်းထားမည့် Cache
const seenMessageIds = new Set();
let activeWorker = null;

// 📸🖼️ [မီဒီယာအတွက် အသစ်ထည့်သွင်းသော Global States]
let dmSelectedImage = null;
let dmSelectedVoice = null;
let popSelectedImage = null;
let popSelectedVoice = null;
let sosSelectedImage = null;
let sosSelectedVoice = null;

// 📸 [Camera အတွက် Global Stream State]
let activeCameraStream = null;
let activeCameraContext = null;

// 🔊 [ကမ္ဘာလုံးဆိုင်ရာ အသံစနစ်] - Siren ဥဩသံကို ကြိုတင်ဖန်တီးထားမည်
const alertAudio = new Audio(
  "https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg",
);

// https://actions.google.com/sounds/v1/emergency/emergency_siren_approaching.ogg
alertAudio.loop = true;
alertAudio.volume = 1.0;

let isAlertActive = false;

// စာမျက်နှာ စတက်တာနဲ့ Live Sync လုပ်ငန်းစဉ် စတင်မည်
document.addEventListener("DOMContentLoaded", () => {
  // သိမ်းထားသော နာမည်ကို input တွင် ပြန်ထည့်ပေးခြင်း
  const nameInput = document.getElementById("my-device-name");
  if (nameInput) nameInput.value = MY_NAME;

  initNotification();
  initServiceWorker();

  // 📌 [ပြုပြင်ချက်] - IP တစ်ခုတည်း တောင်းရုံတင်မကဘဲ Server ဆီမှာပါ ကိုယ့်စက် ID နဲ့ IP အစစ်ကို သွားတွဲခိုင်းမည်
  registerClient();

  // 📌 Pop-up Modal UI Element အား ကြိုတင်ဆောက်ထားမည် (See More အတွက်)
  createReplyModalElement();

  // 📌 ပုံနှင့် အသံ ထည့်သွင်းရန် လိုအပ်သော HTML DOM Elements များကို အလိုအလျောက် ဖြည့်စွက်ပေးမည်
  injectMediaInputsToUI();

  // 📸 Camera Modal UI ကို အသင့်ထည့်သွင်းပေးမည်
  createCameraModalElement();

  document.addEventListener(
    "click",
    () => {
      alertAudio
        .play()
        .then(() => {
          alertAudio.pause();
          console.log("🔊 Phone/PC Audio Engine: ACTIVATED & UNLOCKED");
        })
        .catch((err) => console.log("Audio unlock failed: ", err));
    },
    { once: true },
  );

  setInterval(fetchPeers, 3000);
  setInterval(fetchMessages, 2500);

  // 🌐 **[NEW ADDED]** Active Device အရေအတွက်ကို Server ဆီမှ ပုံမှန်လှမ်းဆွဲရန် Interval ထည့်သွင်းခြင်း
  setInterval(fetchActiveCount, 3000);
  fetchActiveCount();
});

// ကိုယ့်ရဲ့ နာမည်ကို LocalStorage တွင် သိမ်းဆည်းခြင်းနှင့် Server ထံ အပ်ဒိတ်လုပ်ခြင်း
function saveMyName() {
  const nameInput = document.getElementById("my-device-name");
  if (nameInput) {
    MY_NAME = nameInput.value.trim() || "MyDevice-Phone";
    localStorage.setItem("my_device_name", MY_NAME);
    console.log("👤 Saved my name as:", MY_NAME);

    // 📌 နာမည်အသစ် ပြောင်းသွားရင် Server ဆီမှာပါ သွားရောက် Register ပြန်လုပ်ပေးမည်
    registerClient();
  }
}

// ကိုယ့်စက်ရဲ့ IP Address ကို Backend ထံမှ တောင်းယူခြင်း (Fallback အဖြစ်သာ ထားရှိမည်)
async function fetchMyIP() {
  try {
    const response = await fetch(`${API_BASE}/api/my_ip`, {
      headers: { "ngrok-skip-browser-warning": "69420" },
    });
    const data = await response.json();
    MY_IP = data.ip;
    console.log("🌐 My Detected IP:", MY_IP);
  } catch (err) {
    console.error("Error fetching my IP:", err);
  }
}

// 📌 PC Server ဆီသို့ ကိုယ့် ID နှင့် IP အစစ်ကို မှတ်ပုံတင်ပြီး ချိတ်ဆက်ပေးခြင်း
async function registerClient() {
  try {
    const response = await fetch(`${API_BASE}/api/register_client`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "69420",
      },
      body: JSON.stringify({
        client_id: MY_CLIENT_ID,
        chat_name: MY_NAME,
      }),
    });
    const data = await response.json();
    MY_IP = data.ip;
    console.log("🌐 Client Registered Successfully! My Real IP:", MY_IP);
  } catch (err) {
    console.error("Error registering client to server:", err);
    fetchMyIP();
  }
}

// --- 🌐 [NEW ADDED] Server ထံမှ Active ဆက်သွယ်နေသော အရေအတွက်ကို တောင်းခံခြင်း ---
async function fetchActiveCount() {
  try {
    const response = await fetch(`${API_BASE}/api/active_count`, {
      method: "GET",
      headers: { "ngrok-skip-browser-warning": "69420" },
    });
    const data = await response.json();

    // UI ပေါ်တွင် mesh count သို့မဟုတ် device count ပြသသည့် element ရှိပါက ထည့်သွင်းပေးမည်
    const meshCountEl = document.getElementById("device-count");
    if (meshCountEl && data.count !== undefined) {
      meshCountEl.innerText = data.count;
    }
  } catch (err) {
    console.error("Error fetching active count:", err);
  }
}

// --- ၁။ ရေဒါနှင့် ဖုန်းစာရင်းကို API မှ ဆွဲယူခြင်း ---
async function fetchPeers() {
  try {
    const response = await fetch(`${API_BASE}/api/peers`, {
      method: "GET",
      headers: { "ngrok-skip-browser-warning": "69420" },
    });
    const peers = await response.json();

    latestPeers = peers;
    updateRadar(peers);
    updateDeviceList(peers);
  } catch (err) {
    console.error("Error fetching peers:", err);
  }
}

// ရေဒါမျက်နှာပြင်ပေါ်တွင် အစက်ချပြသခြင်း
function updateRadar(peers) {
  const container = document.getElementById("device-container");
  if (!container) return;
  container.innerHTML = "";

  peers.forEach((peer) => {
    const dot = document.createElement("div");
    dot.className = `radar-dot ${peer.isActive ? "active" : "inactive"}`;

    const distancePercent = Math.min(100, (peer.distance / 15) * 100);
    const rad = (peer.angle * Math.PI) / 180;
    const x = 50 + (distancePercent / 2) * Math.cos(rad);
    const y = 50 + (distancePercent / 2) * Math.sin(rad);

    dot.style.left = `${x}%`;
    dot.style.top = `${y}%`;
    dot.title = `${peer.name} (${peer.distance}m)`;

    const deviceIP =
      peer.ip || `192.168.1.${Math.floor(Math.random() * 254) + 1}`;

    dot.onclick = () => openDMModal(peer.name, deviceIP, peer.id);

    container.appendChild(dot);
  });
}

// အောက်ခြေဖုန်းစာရင်း ကတ်ပြားများကို Update လုပ်ခြင်း
function updateDeviceList(peers) {
  const list = document.getElementById("device-list");
  if (!list) return;
  list.innerHTML = "";

  const countEl = document.getElementById("device-count");
  if (countEl && !document.getElementById("active-count-enabled")) {
    countEl.innerText = peers.length;
  }

  if (peers.length === 0) {
    list.innerHTML = `<li class="empty-list">Searching for connected phones/devices...</li>`;
    return;
  }

  peers.forEach((peer) => {
    const li = document.createElement("li");
    li.className = "device-item";

    const deviceIP =
      peer.ip || `192.168.1.${Math.floor(Math.random() * 254) + 1}`;
    const deviceMac = peer.mac || peer.id || "00:00:00:00:00:00";
    const deviceRssi = peer.rssi !== undefined ? peer.rssi : -70;

    li.innerHTML = `
            <div class="device-info">
                <span class="device-status-dot ${peer.isActive ? "online" : "offline"}"></span>
                <strong>${peer.name}</strong>
                <span class="device-sub">${deviceMac} | Approx: ${peer.distance}m (RSSI: ${deviceRssi})</span>
            </div>
            <button class="chat-btn" onclick="openDMModal('${peer.name}', '${deviceIP}', '${peer.id}')">Message</button>
        `;
    list.appendChild(li);
  });
}

// --- ၂။ Messages များကို Sync ဆွဲပြီး ပြသခြင်း ---
async function fetchMessages() {
  try {
    const response = await fetch(
      `${API_BASE}/api/messages?client_id=${MY_CLIENT_ID}`,
      {
        method: "GET",
        headers: { "ngrok-skip-browser-warning": "69420" },
      },
    );
    const messages = await response.json();

    const feed = document.getElementById("message-list-container");
    if (!feed) return;

    if (messages.length === 0) {
      feed.innerHTML = `<p class="empty-inbox">စာတိုများ မရှိသေးပါဗျာ။</p>`;
      return;
    }

    feed.innerHTML = "";
    messages.forEach((msg) => {
      const audioSource = msg.audio_data || msg.voice || msg.audio;
      const imageSource = msg.image_data || msg.image;

      const msgId = msg.msg_id || `${msg.sender_name}-${msg.timestamp}`;

      if (!seenMessageIds.has(msgId)) {
        seenMessageIds.add(msgId);
        if (
          (msg.type === "SOS" || msg.is_broadcast_alert === true) &&
          msg.sender_id !== MY_CLIENT_ID
        ) {
          triggerSOSAlert(msg.sender_name, msg.text);
        }
      }

      let repliesHTML = "";
      if (msg.replies && msg.replies.length > 0) {
        msg.replies.forEach((rep) => {
          const isRescueClass = rep.is_rescue ? "rescue-reply" : "";

          let repMediaHtml = "";
          const repImage = rep.image_data || rep.image;
          const repAudio = rep.audio_data || rep.voice || rep.audio;

          if (repImage) {
            repMediaHtml += `<div style="margin-top:4px;"><img src="${repImage}" style="max-width:150px; border-radius:6px; border:1px solid #323846;" /></div>`;
          }
          if (repAudio) {
            repMediaHtml += `<div style="margin-top:4px;"><audio controls preload="metadata" src="${repAudio}" style="height:30px; width:100%; max-width:200px;" onloadedmetadata="this.playbackRate = 1.0;"></audio></div>`;
          }
          repliesHTML += `
            <div class="reply-item ${isRescueClass}" style="padding:6px 0; border-bottom:1px solid #1c212b; font-size:13px; margin-top:5px;">
               <strong style="color: ${rep.is_rescue ? "#00ff88" : "#aaa"}">${rep.sender_name}:</strong> 
               <span style="color: #ddd;">${rep.text}</span>
               ${repMediaHtml}
            </div>
          `;
        });
      }

      let mainImageHtml = "";
      if (imageSource) {
        mainImageHtml = `<div style="margin-top:8px;"><img src="${imageSource}" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid #323846;" /></div>`;
      }

      let mainVoiceHtml = "";
      if (audioSource) {
        mainVoiceHtml = `<div style="margin-top:8px;"><audio controls preload="metadata" src="${audioSource}" style="height:35px; width:100%;" onloadedmetadata="this.playbackRate = 1.0;"></audio></div>`;
      }

      const count = msg.replies ? msg.replies.length : 0;
      const replyControl =
        count > 0
          ? `<span class="reply-count-badge" style="cursor:pointer; color:#00ff88;" onclick='openPopUpThread(${JSON.stringify(msg)})'>💬 ${count} Reply နှိပ်ကြည့်ရန်</span>`
          : `<button class="reply-trigger-btn" onclick='openPopUpThread(${JSON.stringify(msg)})'>💬 Reply ပြန်မည်</button>`;

      const card = document.createElement("div");
      let headerText = "📢 PUBLIC MESH POST";

      if (msg.type === "SOS") {
        card.className = "msg-card msg-sos";
        headerText = "⚠️ EMERGENCY SOS";
      } else if (msg.type === "RESCUE") {
        card.className = "msg-card msg-rescue-resp";
        headerText = "🛡️ RESCUE RESPONDER UPDATE";
      } else {
        card.className = "msg-card msg-direct";
      }

      card.innerHTML = `
          <div class="msg-header">${headerText}</div>
          <div class="msg-body">${msg.text}</div>
          ${mainImageHtml}
          ${mainVoiceHtml}
          <div class="msg-meta" style="margin-top:6px;">
            ${msg.type === "SOS" ? `<strong>Rescue Contact:</strong> ${msg.rescue_contact}<br>` : ""}
            <span>From: ${msg.sender_name} | ${new Date(msg.timestamp * 1000).toLocaleTimeString()}</span>
          </div>
          <div style="margin-top:10px;">${replyControl}</div>
          <div class="replies-container">${repliesHTML}</div>
      `;
      feed.appendChild(card);
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

// --- ၃။ SOS Broadcast ပို့ဆောင်ခြင်း ---
async function triggerSOS() {
  const contact = document.getElementById("sos-contact").value.trim();
  const message = document.getElementById("sos-message").value.trim();

  if (!contact) {
    alert("ကျေးဇူးပြု၍ ကယ်ဆယ်ရေး Contact တစ်ခုခု အရင်ထည့်ပါ!");
    return;
  }

  const nameInput = document.getElementById("my-device-name");
  if (nameInput) {
    MY_NAME = nameInput.value.trim() || "MyDevice-Phone";
    localStorage.setItem("my_device_name", MY_NAME);
  }

  try {
    const response = await fetch(`${API_BASE}/api/send_sos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "69420",
      },
      body: JSON.stringify({
        text: message || "⚠️ အရေးပေါ် ကူညီကယ်ဆယ်ရေး လိုအပ်နေပါသည်!",
        rescue_contact: contact,
        sender_name: MY_NAME,
        sender_id: MY_CLIENT_ID,
        image_data: sosSelectedImage || null,
        audio_data: sosSelectedVoice || null,
      }),
    });

    const result = await response.json();
    if (result.status === "success") {
      alert(
        "🚨 SOS Broadcast ကို Network တစ်ခုလုံးသို့ ပုံ/အသံ အတူ ဖြန့်ဝေပြီးပါပြီ!",
      );
      document.getElementById("sos-message").value = "";
      sosSelectedImage = null;
      sosSelectedVoice = null;
      clearMediaPreviews("sos");
    } else {
      alert("Error: " + (result.message || result.error || "SOS ပို့မရပါ"));
    }
  } catch (err) {
    alert("SOS Broadcast ပို့ဆောင်ခြင်း မအောင်မြင်ပါ- " + err.message);
  }
}

// --- ၄။ Direct Chat Modal စနစ် ---
let targetMsgIdForReply = "";

function openDMModal(name, ip, peerId) {
  selectedDeviceName = name;
  selectedDeviceIP = ip;

  document.getElementById("dm-target-title").innerText =
    `Reply Thread to ${name}`;
  document.getElementById("dm-target-ip").innerText = ip;

  targetMsgIdForReply = "";
  const lastPeerMsg = Array.from(seenMessageIds)
    .reverse()
    .find((id) => id.startsWith(name) || id.includes(name));
  if (lastPeerMsg) {
    targetMsgIdForReply = lastPeerMsg;
  }

  const modal = document.getElementById("dm-modal");
  if (modal) modal.style.display = "flex";
}

function closeDMModal() {
  const modal = document.getElementById("dm-modal");
  if (modal) modal.style.display = "none";
  document.getElementById("dm-text").value = "";
  const check = document.getElementById("dm-is-rescue");
  if (check) check.checked = false;
  dmSelectedImage = null;
  dmSelectedVoice = null;
  clearMediaPreviews("dm");
}

async function sendDirectMessage() {
  const text = document.getElementById("dm-text").value.trim();

  const rescueCheckbox = document.getElementById("dm-is-rescue");
  const isRescue = rescueCheckbox ? rescueCheckbox.checked : false;

  if (!text && !dmSelectedImage && !dmSelectedVoice) {
    alert("စာသား (သို့) မီဒီယာ တစ်ခုခု ဖြည့်စွက်ပါဦး!");
    return;
  }
  const nameInput = document.getElementById("my-device-name");
  if (nameInput) {
    MY_NAME = nameInput.value.trim() || "MyDevice-Phone";
    localStorage.setItem("my_device_name", MY_NAME);
  }
  let apiUrl = `${API_BASE}/api/reply_message`;
  let requestBody = {
    parent_msg_id: targetMsgIdForReply,
    text: text,
    sender_name: MY_NAME,
    sender_id: MY_CLIENT_ID,
    is_rescue: isRescue,
    new_type: isRescue ? "RESCUE" : "PUBLIC",
    image_data: dmSelectedImage,
    audio_data: dmSelectedVoice,
  };

  if (!targetMsgIdForReply) {
    apiUrl = `${API_BASE}/api/send_sos`;
    requestBody = {
      text: `@${selectedDeviceName} ${text}`,
      rescue_contact: "",
      sender_name: MY_NAME,
      sender_id: MY_CLIENT_ID,
      new_type: isRescue ? "RESCUE" : "PUBLIC",
      image_data: dmSelectedImage,
      audio_data: dmSelectedVoice,
    };
  }
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "69420",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    if (result.status === "success") {
      closeDMModal();
      fetchMessages();
    } else {
      alert("Error: " + (result.message || "စာပို့မရပါ"));
    }
  } catch (err) {
    alert("စာပို့ဆောင်ခြင်း မအောင်မြင်ပါ- " + err.message);
  }
}

// --- 🖼️ See More အတွက် Pop-up Modal UI Layout ---
function createReplyModalElement() {
  if (document.getElementById("popup-thread-modal")) return;
  const modal = document.createElement("div");
  modal.id = "popup-thread-modal";
  modal.style =
    "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; justify-content:center; align-items:center; padding:20px; box-sizing:border-box;";
  modal.innerHTML = `
    <div style="background:#1a1d24; border:1px solid #323846; width:100%; max-width:550px; border-radius:12px; padding:20px; color:#fff; position:relative; box-shadow:0 10px 30px rgba(0,0,0,0.5); max-height:90vh; overflow-y:auto;">
        <span onclick="closePopUpThread()" style="position:absolute; top:12px; right:16px; cursor:pointer; font-size:24px; color:#aaa;">&times;</span>
        <h3 style="color:#00ff88; margin-top:0;">Discussion Thread</h3>
        <div id="pop-modal-parent-body" style="background:#242936; padding:12px; border-radius:6px; margin-bottom:15px; font-size:15px; border-left:4px solid #00ff88;"></div>
        <div id="pop-modal-replies-list" style="max-height:220px; overflow-y:auto; background:#15181f; border:1px solid #242936; padding:10px; border-radius:6px; margin-bottom:15px;"></div>
        
        <div id="pop-media-preview" style="margin-bottom:8px;"></div>
        <div style="display:flex; gap:10px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
           <label style="cursor:pointer; background:#242936; padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid #323846;">📁 Upload Image <input type="file" accept="image/*" onchange="handleFileSelect(event, 'pop')" style="display:none;"/></label>
           <button type="button" onclick="openCameraModal('pop')" style="background:#242936; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid #323846; cursor:pointer;">📸 Capture Photo</button>
           <button type="button" onclick="toggleVoiceRecord('pop')" id="pop-mic-btn" style="background:#242936; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid #323846; cursor:pointer;">🎙️ Record Voice</button>
        </div>

        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:13px; color:#00ff88;">
          <input type="checkbox" id="pop-modal-is-rescue" style="accent-color:#00ff88; width:16px; height:16px; cursor:pointer;" />
          <label for="pop-modal-is-rescue" style="cursor:pointer;">🛡️ Mark as Rescue Responder</label>
        </div>

        <div style="display:flex; gap:8px;">
          <input type="text" id="pop-modal-input" placeholder="လူတိုင်း စာပြန်နိုင်ပါတယ်ဗျာ..." style="flex:1; padding:10px; background:#242936; border:1px solid #323846; border-radius:6px; color:#fff;" />
          <button id="pop-modal-submit-btn" style="background:#00ff88; color:#000; border:none; padding:0 18px; border-radius:6px; font-weight:bold; cursor:pointer;">Reply</button>
        </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function openPopUpThread(msg) {
  const modal = document.getElementById("popup-thread-modal");
  const listContainer = document.getElementById("pop-modal-replies-list");
  const parentBody = document.getElementById("pop-modal-parent-body");

  listContainer.innerHTML = "";

  let parentMediaHtml = "";
  if (msg.image_data || msg.image)
    parentMediaHtml += `<div><img src="${msg.image_data || msg.image}" style="max-width:120px; border-radius:4px; margin-top:5px;" /></div>`;
  if (msg.audio_data || msg.voice)
    parentMediaHtml += `<div><audio controls preload="metadata" src="${msg.audio_data || msg.voice}" style="height:25px; width:100%; margin-top:5px;" onloadedmetadata="this.playbackRate = 1.0;"></audio></div>`;

  parentBody.innerHTML = `<strong>${msg.sender_name}:</strong> ${msg.text} ${parentMediaHtml}`;

  if (msg.replies && msg.replies.length > 0) {
    msg.replies.forEach((rep) => {
      const item = document.createElement("div");
      const isRescueClass = rep.is_rescue ? "rescue-reply" : "";

      let repMediaHtml = "";
      if (rep.image_data || rep.image)
        repMediaHtml += `<div><img src="${rep.image_data || rep.image}" style="max-width:100px; border-radius:4px; margin-top:4px;" /></div>`;
      if (rep.audio_data || rep.voice)
        repMediaHtml += `<div><audio controls preload="metadata" src="${rep.audio_data || rep.voice}" style="height:25px; width:100%; margin-top:4px;" onloadedmetadata="this.playbackRate = 1.0;"></audio></div>`;

      item.className = `reply-item ${isRescueClass}`;
      item.innerHTML = `
        <strong style="color: ${rep.is_rescue ? "#00ff88" : "#aaa"}">
            ${rep.sender_id === MY_CLIENT_ID ? "သင်" : rep.sender_name}:
        </strong> 
        <span>${rep.text}</span>
        ${repMediaHtml}
      `;
      listContainer.appendChild(item);
    });
  }
  const submitBtn = document.getElementById("pop-modal-submit-btn");
  const inputField = document.getElementById("pop-modal-input");
  const rescueCheckbox = document.getElementById("pop-modal-is-rescue");

  inputField.value = "";
  if (rescueCheckbox) rescueCheckbox.checked = false;
  popSelectedImage = null;
  popSelectedVoice = null;
  clearMediaPreviews("pop");

  submitBtn.onclick = async () => {
    const text = inputField.value.trim();
    const isRescue = rescueCheckbox ? rescueCheckbox.checked : false;

    if (!text && !popSelectedImage && !popSelectedVoice) return;
    saveMyName();
    try {
      const res = await fetch(`${API_BASE}/api/reply_message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify({
          parent_msg_id: msg.msg_id || msg.id,
          text: text,
          sender_name: MY_NAME,
          sender_id: MY_CLIENT_ID,
          is_rescue: isRescue,
          new_type: isRescue ? "RESCUE" : "PUBLIC",
          image_data: popSelectedImage,
          audio_data: popSelectedVoice,
        }),
      });
      if ((await res.json()).status === "success") {
        closePopUpThread();
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    }
  };
  modal.style.display = "flex";
}

function closePopUpThread() {
  const modal = document.getElementById("popup-thread-modal");
  if (modal) modal.style.display = "none";
  popSelectedImage = null;
  popSelectedVoice = null;
}

window.onclick = function (event) {
  const modal = document.getElementById("dm-modal");
  const popModal = document.getElementById("popup-thread-modal");
  const camModal = document.getElementById("camera-modal");
  if (event.target == modal) closeDMModal();
  if (event.target == popModal) closePopUpThread();
  if (event.target == camModal) closeCameraModal();
};

// --- ၅။ Notification စနစ် ---
function initNotification() {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        console.log("🔔 Notification Permission Allowed!");
      }
    });
  }
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js?v=1.0.2")
      .then((reg) => {
        console.log("✨ Service Worker Registered successfully!");
        activeWorker = reg.active || reg.waiting || reg.installing;
      })
      .catch((err) =>
        console.error("Service Worker Registration Failed:", err),
      );
  }
}

function triggerSOSAlert(senderName, messageText) {
  if (isAlertActive) return;
  isAlertActive = true;

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "TRIGGER_SOS",
      sender: senderName,
      text: messageText,
    });
  }
  alertAudio.currentTime = 0;
  alertAudio
    .play()
    .then(() => {
      setTimeout(() => {
        alert(
          `🚨 [အရေးပေါ်သတိပေးချက်] 🚨\n\nပေးပို့သူ: ${senderName}\n\n" ${messageText} "`,
        );
        alertAudio.pause();
        alertAudio.currentTime = 0;
        isAlertActive = false;
      }, 1500);
    })
    .catch((e) => {
      alert(
        `🚨 [အရေးပေါ်သတိပေးချက်] \n\nပေးပို့သူ: ${senderName}\n\n" ${messageText} "`,
      );
      isAlertActive = false;
    });
}

async function sendBroadcastAlert() {
  if (latestPeers.length === 0) return alert("လက်တလော စက်များ ရှာမတွေ့သေးပါ!");

  const message = prompt("⚠️ အရေးပေါ်သတိပေးချက် စာသားရိုက်ပါ:");
  if (!message) return;

  try {
    await fetch(`${API_BASE}/api/send_sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        rescue_contact: "BROADCAST_ALL",
        sender_name: MY_NAME,
        sender_id: MY_CLIENT_ID,
      }),
    });
    alert("🚨 အနီးအနားရှိ စက်အားလုံးသို့ Alert ပို့လိုက်ပါပြီ!");
  } catch (err) {
    console.error("Broadcast Error:", err);
  }
}

async function sendBroadcastMessage() {
  if (latestPeers.length === 0) return alert("လက်တလော စက်များ ရှာမတွေ့သေးပါ!");

  const message = prompt("📢 အားလုံးကို ပို့မည့် စာသား:");
  if (!message) return;

  try {
    await fetch(`${API_BASE}/api/send_sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        rescue_contact: "",
        sender_name: MY_NAME,
        sender_id: MY_CLIENT_ID,
      }),
    });
    alert("📢 မက်ဆေ့ချ် ပို့လိုက်ပါပြီ!");
  } catch (err) {
    console.error("Broadcast Error:", err);
  }
}

const SERVER_URL =
  localStorage.getItem("zapya_server_ip") || "http://192.168.43.1:5000";

// ==========================================
// 🛠️ ဓာတ်ပုံနှင့် အသံဖိုင် ပံ့ပိုးပေးသည့် Helper Functions များ
// ==========================================

let selectedImagesMap = {};
let selectedVoicesMap = {};

function handleFileSelect(event, context) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64Str = e.target.result;
    if (context === "dm") {
      dmSelectedImage = base64Str;
      selectedImagesMap["dm"] = file.name;
    } else if (context === "pop") {
      popSelectedImage = base64Str;
      selectedImagesMap["pop"] = file.name;
    } else if (context === "sos") {
      sosSelectedImage = base64Str;
      selectedImagesMap["sos"] = file.name;
    }
    updateMediaPreview(context);
  };
  reader.readAsDataURL(file);
}

// 📸 [Camera Modal နှင့် Capture Logic]
function createCameraModalElement() {
  if (document.getElementById("camera-modal")) return;
  const modal = document.createElement("div");
  modal.id = "camera-modal";
  modal.style =
    "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; justify-content:center; align-items:center; flex-direction:column; padding:15px; box-sizing:border-box;";
  modal.innerHTML = `
    <div style="position:relative; width:100%; max-width:400px; background:#1a1d24; border-radius:12px; overflow:hidden; border:1px solid #323846; text-align:center; padding:15px;">
        <span onclick="closeCameraModal()" style="position:absolute; top:10px; right:15px; cursor:pointer; font-size:24px; color:#aaa; z-index:10;">&times;</span>
        <h3 style="color:#00ff88; margin-top:0; margin-bottom:10px; font-size:16px;">📷 ကင်မရာဖြင့် ဓာတ်ပုံရိုက်ရန်</h3>
        <div style="position:relative; width:100%; height:300px; background:#000; border-radius:8px; overflow:hidden; display:flex; justify-content:center; align-items:center;">
            <video id="live-camera-video" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
        </div>
        <canvas id="live-camera-canvas" style="display:none;"></canvas>
        <div style="margin-top:15px;">
            <button type="button" onclick="capturePhotoFromCamera()" style="background:#00ff88; color:#000; border:none; padding:10px 20px; border-radius:30px; font-weight:bold; cursor:pointer; font-size:14px;">📸 ဓာတ်ပုံရိုက်မည်</button>
        </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function openCameraModal(context) {
  activeCameraContext = context;
  createCameraModalElement();
  const modal = document.getElementById("camera-modal");
  const videoElement = document.getElementById("live-camera-video");

  modal.style.display = "flex";

  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    videoElement.srcObject = activeCameraStream;
  } catch (err) {
    alert("ကင်မရာ ဖွင့်ခွင့်မရပါ (သို့) ကင်မရာမရှိပါ: " + err.message);
    closeCameraModal();
  }
}

function closeCameraModal() {
  const modal = document.getElementById("camera-modal");
  if (modal) modal.style.display = "none";

  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }
}

function capturePhotoFromCamera() {
  const video = document.getElementById("live-camera-video");
  const canvas = document.getElementById("live-camera-canvas");

  if (!video.videoWidth) {
    alert("ကင်မရာ အသင့်မဖြစ်သေးပါ၊ ခဏစောင့်ပါ။");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Str = canvas.toDataURL("image/jpeg", 0.85);
  const context = activeCameraContext;

  if (context === "dm") {
    dmSelectedImage = base64Str;
    selectedImagesMap["dm"] = "Camera_Photo.jpg";
  } else if (context === "pop") {
    popSelectedImage = base64Str;
    selectedImagesMap["pop"] = "Camera_Photo.jpg";
  } else if (context === "sos") {
    sosSelectedImage = base64Str;
    selectedImagesMap["sos"] = "Camera_Photo.jpg";
  }
  updateMediaPreview(context);

  closeCameraModal();
}

// 📌 Audio Context နဲ့ Recorder အတွက် Global Object များ
var myRecorder = {
  objects: {
    context: null,
    stream: null,
    recorder: null,
  },
  init: function () {
    if (null === myRecorder.objects.context) {
      myRecorder.objects.context = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }
  },
};

async function toggleVoiceRecord(context) {
  const btnId =
    context === "dm"
      ? "dm-mic-btn"
      : context === "pop"
        ? "pop-mic-btn"
        : "sos-mic-btn";
  const btn = document.getElementById(btnId);

  myRecorder.init();

  if (
    !myRecorder.objects.recorder ||
    (btn && btn.getAttribute("data-recording") !== "true")
  ) {
    try {
      const options = { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(options);

      myRecorder.objects.stream = stream;
      myRecorder.objects.recorder = new Recorder(
        myRecorder.objects.context.createMediaStreamSource(stream),
        { numChannels: 1 },
      );

      myRecorder.objects.recorder.record();

      if (btn) {
        btn.setAttribute("data-recording", "true");
        btn.innerText = "⏹️ ရပ်မည် (Recording...)";
        btn.style.background = "#ff4444";
      }
    } catch (err) {
      alert("အသံသွင်းရန် မိုက်ခရိုဖုန်း ခွင့်ပြုချက် မရရှိပါ - " + err.message);
    }
  } else {
    if (null !== myRecorder.objects.stream) {
      myRecorder.objects.stream.getAudioTracks()[0].stop();
    }

    if (null !== myRecorder.objects.recorder) {
      myRecorder.objects.recorder.stop();

      myRecorder.objects.recorder.exportWAV(function (blob) {
        if (blob.size === 0) {
          console.error("❌ အသံဖိုင်အရွယ်အစား 0 ဖြစ်နေပါသည်။");
          return;
        }

        const wavBlob = new Blob([blob], { type: "audio/wav" });
        var reader = new FileReader();

        reader.onload = function (e) {
          const base64Audio = e.target.result;
          if (context === "dm") {
            dmSelectedVoice = base64Audio;
            selectedVoicesMap["dm"] = "Voice Note";

            const audioPreview = document.getElementById(
              "dm-audio-preview-element",
            );
            const previewContainer = document.getElementById(
              "dm-voice-preview-container",
            );
            if (audioPreview && previewContainer) {
              audioPreview.src = base64Audio;
              previewContainer.style.display = "block";
            }
          }
          if (context === "pop") {
            popSelectedVoice = base64Audio;
            selectedVoicesMap["pop"] = "Voice Note";
          }
          if (context === "sos") {
            sosSelectedVoice = base64Audio;
            selectedVoicesMap["sos"] = "Voice Note";
          }
          updateMediaPreview(context);
        };

        reader.readAsDataURL(wavBlob);
      });
    }

    if (btn) {
      btn.setAttribute("data-recording", "");
      btn.innerText = "🎙️ Record Voice";
      btn.style.background = "";
    }
  }
}

// 📌 ပုံနှင့် အသံ နှစ်ခုစလုံးကို တစ်ပြိုင်နက် ပြသပေးမည့် Updated Preview Function
function updateMediaPreview(context) {
  const previewId =
    context === "dm"
      ? "dm-media-preview"
      : context === "pop"
        ? "pop-media-preview"
        : "sos-media-preview";
  let container = document.getElementById(previewId);
  if (!container) {
    container = document.createElement("div");
    container.id = previewId;
    const targetInputBox =
      context === "dm"
        ? document.getElementById("dm-text")
        : context === "pop"
          ? document.getElementById("pop-modal-input")
          : document.getElementById("sos-message");
    if (targetInputBox && targetInputBox.parentNode) {
      targetInputBox.parentNode.insertBefore(container, targetInputBox);
    }
  }

  let htmlContent = "";

  const imgName = selectedImagesMap[context];
  if (imgName) {
    htmlContent += `<span style="font-size:12px; background:#00ff8833; color:#00ff88; padding:3px 8px; border-radius:4px; border:1px solid #00ff88; display:inline-flex; align-items:center; gap:6px; margin-right:5px; margin-bottom:5px;">✓ Attached image: ${imgName} <button type="button" onclick="clearSpecificMedia('${context}', 'image')" style="background: transparent; border: none; color: #ff4d4d; font-weight: bold; cursor: pointer; font-size: 14px;" title="Cancel">❌</button></span>`;
  }

  const voiceName = selectedVoicesMap[context];
  if (voiceName) {
    htmlContent += `<span style="font-size:12px; background:#00ff8833; color:#00ff88; padding:3px 8px; border-radius:4px; border:1px solid #00ff88; display:inline-flex; align-items:center; gap:6px; margin-bottom:5px;">✓ Attached voice: ${voiceName} <button type="button" onclick="clearSpecificMedia('${context}', 'voice')" style="background: transparent; border: none; color: #ff4d4d; font-weight: bold; cursor: pointer; font-size: 14px;" title="Cancel">❌</button></span>`;
  }

  container.innerHTML = htmlContent;
}

window.clearSpecificMedia = function (context, type) {
  if (type === "image") {
    if (context === "dm") dmSelectedImage = null;
    else if (context === "pop") popSelectedImage = null;
    else if (context === "sos") sosSelectedImage = null;
    delete selectedImagesMap[context];
  } else if (type === "voice") {
    if (context === "dm") {
      dmSelectedVoice = null;
      const previewContainer = document.getElementById(
        "dm-voice-preview-container",
      );
      if (previewContainer) previewContainer.style.display = "none";
    } else if (context === "pop") popSelectedVoice = null;
    else if (context === "sos") sosSelectedVoice = null;
    delete selectedVoicesMap[context];
  }
  updateMediaPreview(context);
};

function clearMediaPreviews(context) {
  selectedImagesMap[context] = null;
  selectedVoicesMap[context] = null;
  if (context === "dm") {
    dmSelectedImage = null;
    dmSelectedVoice = null;
    const previewContainer = document.getElementById(
      "dm-voice-preview-container",
    );
    if (previewContainer) previewContainer.style.display = "none";
  }
  if (context === "pop") {
    popSelectedImage = null;
    popSelectedVoice = null;
  }
  if (context === "sos") {
    sosSelectedImage = null;
    sosSelectedVoice = null;
  }

  const previewId =
    context === "dm"
      ? "dm-media-preview"
      : context === "pop"
        ? "pop-media-preview"
        : "sos-media-preview";
  const container = document.getElementById(previewId);
  if (container) container.innerHTML = "";
}

function injectMediaInputsToUI() {
  const sosSection = document.getElementById("sos-message");
  if (sosSection && !document.getElementById("sos-media-preview")) {
    const div = document.createElement("div");
    div.innerHTML = `
      <div id="sos-media-preview" style="margin-bottom:8px;"></div>
      <div style="display:flex; gap:10px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
         <label style="cursor:pointer; background:var(--input-bg-color); padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid var(--input-border-color); color:var(--text-primary);">📁 Upload Image <input type="file" accept="image/*" onchange="handleFileSelect(event, 'sos')" style="display:none;"/></label>
         <button type="button" onclick="openCameraModal('sos')" style="background:var(--input-bg-color); color:var(--text-primary); padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid var(--input-border-color); cursor:pointer;">📸 Capture Photo</button>
         <button type="button" onclick="toggleVoiceRecord('sos')" id="sos-mic-btn" style="background:var(--input-bg-color); color:var(--text-primary); padding:6px 10px; border-radius:4px; font-size:12px; border:1px solid var(--input-border-color); cursor:pointer;">🎙️ Record Voice</button>
      </div>
    `;
    sosSection.parentNode.insertBefore(div, sosSection);
  }
}

window.clearSosMedia = function () {
  clearMediaPreviews("sos");
  clearMediaPreviews("dm");
  clearMediaPreviews("pop");
};

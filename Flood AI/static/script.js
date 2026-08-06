// 1. Real-Time Clock
const clock = document.getElementById('clock');
function tick() {
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour12: false });
}
tick();
setInterval(tick, 1000);



// 2. Mobile Sidebar & Menu Controls
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuButton = document.getElementById('menuButton');

function toggleMenu(open) {
  if (sidebar) sidebar.classList.toggle('open', open);
  if (overlay) overlay.classList.toggle('show', open);
}

if (menuButton) menuButton.addEventListener('click', () => toggleMenu(true));
if (overlay) overlay.addEventListener('click', () => toggleMenu(false));

document.querySelectorAll('.sidebar a').forEach(a => {
  a.addEventListener('click', () => toggleMenu(false));
});



// 3. Water Level / Chart Time Range Selector
document.querySelectorAll('.range button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});



// 4. Satellite Live Map Initialization
let mapInstance = null;

function initSatelliteMap() {
  if (mapInstance) return;

  const lat = 16.9292;
  const lng = 97.3686;
  mapInstance = L.map('map').setView([lat, lng], 12);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics'
  }).addTo(mapInstance);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  fetch('/api/v1/live-sensors')
    .then(response => response.json())
    .then(sensors => {
      sensors.forEach(sensor => {
        const color = sensor.level === 'Critical' ? '#e63946' : '#0787e8';
        L.circleMarker([sensor.lat, sensor.lng], {
          color: color,
          fillColor: color,
          fillOpacity: 0.8,
          radius: 8
        }).addTo(mapInstance).bindPopup(`<b>${sensor.name}</b><br>Level: ${sensor.level}`);
      });
    })
    .catch(() => {
      L.marker([lat, lng]).addTo(mapInstance)
        .bindPopup('<b>Thaton Center</b><br>Water level: 1.2m (Normal)')
        .openPopup();

      L.circle([16.95, 97.38], {
        color: '#cb202b',
        fillColor: '#cb202b',
        fillOpacity: 0.35,
        radius: 1200
      }).addTo(mapInstance).bindPopup('<b>Gort Village</b><br>Critical Water Level Alert');
    });
}



// 5. Flood Safety Phase Content & Logic
const phaseContentData = {
  before: [
    { title: "Assemble Kit", desc: "Gather essential supplies, including water, food, and medicine for at least 72 hours.", icon: "package" },
    { title: "Secure Property", desc: "Move furniture and electrical items to higher floors. Install flood barriers if available.", icon: "home" }
  ],
  during: [
    { title: "Evacuate Immediately", desc: "If instructed to leave, do so right away. Never drive or walk through moving floodwaters.", icon: "alert-triangle" },
    { title: "Move to Higher Ground", desc: "Stay on upper levels of sturdy structures. Avoid basements or trapped attic spaces.", icon: "arrow-up-circle" }
  ],
  after: [
    { title: "Wait for All-Clear", desc: "Return home only when emergency services declare it safe. Inspect structures for damage.", icon: "check-circle" },
    { title: "Avoid Standing Water", desc: "Floodwaters often contain hazardous chemicals, debris, or submerged electrical lines.", icon: "shield-alert" }
  ]
};

function initSafetyTabs() {
  const tabs = document.querySelectorAll('.phase-tab');
  const contentContainer = document.getElementById('phase-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const phase = tab.getAttribute('data-phase');
      const items = phaseContentData[phase] || [];

      if (contentContainer) {
        contentContainer.innerHTML = items.map(item => `
          <div class="action-card">
            <div class="action-icon blue">
              <i data-lucide="${item.icon}"></i>
            </div>
            <div class="action-info">
              <h4>${item.title}</h4>
              <p>${item.desc}</p>
            </div>
          </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
      }
    });
  });
}


// 6. Support Page Interactions (FAQ & Form)
function initSupportPage() {
  // FAQ Accordion Toggle
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('active');
        faqItems.forEach(i => i.classList.remove('active'));
        if (!isOpen) {
          item.classList.add('active');
        }
      });
    }
  });

  // Support Ticket Form Handling
  const form = document.getElementById('support-form');
  const feedback = document.getElementById('form-feedback');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Simulate form submission success
      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = 'form-feedback success';
        feedback.textContent = '✓ Ticket submitted successfully! Our tech team will reply shortly.';
      }
      form.reset();

      setTimeout(() => {
        if (feedback) feedback.style.display = 'none';
      }, 5000);
    });
  }
}



// 7. Layer Switching (Home,Map,Safety ,Support, contact)


function switchLayer(targetHash) {
  const homeView = document.getElementById('home-view');
  const mapView = document.getElementById('map-view');
  const reportsView = document.getElementById('reports-view'); // 1. Reports View ထည့်သွင်းခြင်း
  const safetyView = document.getElementById('safety-view');
  const supportView = document.getElementById('support-view');
  const contactView = document.getElementById('contact-view');

  const allNavLinks = document.querySelectorAll('.side-nav a, .bottom-nav a');

  // Determine active view hash
  let activeHash = '#home';
  if (targetHash === '#map') activeHash = '#map';
  if (targetHash === '#reports') activeHash = '#reports'; // Reports Hash စစ်ဆေးခြင်း
  if (targetHash === '#safety') activeHash = '#safety';
  if (targetHash === '#support') activeHash = '#support';
  if (targetHash === '#contact') activeHash = '#contact';

  // 1. Update navigation active highlight states
  allNavLinks.forEach(link => {
    if (link.getAttribute('href') === activeHash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 2. Hide all views first
  if (homeView) homeView.style.display = 'none';
  if (mapView) mapView.style.display = 'none';
  if (reportsView) reportsView.style.display = 'none'; // Reports View ကို ဖျောက်ခြင်း
  if (safetyView) safetyView.style.display = 'none';
  if (supportView) supportView.style.display = 'none';
  if (contactView) contactView.style.display = 'none';

  // 3. Show target view
  if (activeHash === '#map') {
    if (mapView) mapView.style.display = 'block';
    if (typeof initSatelliteMap === 'function') initSatelliteMap();

    setTimeout(() => {
      if (typeof mapInstance !== 'undefined' && mapInstance) mapInstance.invalidateSize();
      if (window.lucide) lucide.createIcons();
    }, 150);

  } else if (activeHash === '#reports') {
    if (reportsView) reportsView.style.display = 'block'; // Reports နှိပ်လျှင် Reports View ကို ဖော်ပြမည်
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);

  } else if (activeHash === '#safety') {
    if (safetyView) safetyView.style.display = 'block';
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);

  } else if (activeHash === '#support') {
    if (supportView) supportView.style.display = 'block';
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);

  } else if (activeHash === '#contact') {
    if (contactView) contactView.style.display = 'block';
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);

  } else {
    if (homeView) homeView.style.display = 'block';
  }

  // 4. Close mobile menu if open
  if (typeof toggleMenu === 'function') {
    toggleMenu(false);
  }
}

// Global Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Page တက်လာချိန် သို့မဟုတ် Hash ပြောင်းချိန်တွင် View လဲပေးခြင်း
  const currentHash = window.location.hash || '#home';
  switchLayer(currentHash);

  window.addEventListener('hashchange', () => {
    switchLayer(window.location.hash);
  });

  // Sidebar Links များကို Click Event တပ်ပေးခြင်း
  const allNavLinks = document.querySelectorAll('.side-nav a, .bottom-nav a');
  allNavLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      const targetHash = this.getAttribute('href');
      if (targetHash && targetHash.startsWith('#')) {
        switchLayer(targetHash);
      }
    });
  });
});

// Navigation Event Listeners & Load Trigger
// Click handlers for nav links
document.querySelectorAll('a[href="#home"], a[href="#map"], a[href="#safety"], a[href="#support"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const hash = anchor.getAttribute('href');
    window.location.hash = hash;
    switchLayer(hash);
  });
});

// Watch URL changes (Browser Back/Forward buttons)
window.addEventListener('hashchange', () => {
  switchLayer(window.location.hash);
});

// Run automatically on initial page load
document.addEventListener('DOMContentLoaded', () => {
  const initialHash = window.location.hash || '#home';
  initSafetyTabs();
  initSupportPage();
  switchLayer(initialHash);
});

const form = document.getElementById('support-form');
const formFeedback = document.getElementById('form-feedback');

if (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault(); // Page redirect မဖြစ်အောင် တားခြင်း

    const submitBtn = form.querySelector('.submit-btn');
    const btnSpan = submitBtn.querySelector('span');
    const originalText = btnSpan.innerText;

    submitBtn.disabled = true;
    btnSpan.innerText = 'Sending...';

    const formData = new FormData(form);
    const object = Object.fromEntries(formData);
    const json = JSON.stringify(object);

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: json
    })
      .then(async (response) => {
        let json = await response.json();
        if (response.status == 200) {
          formFeedback.style.display = 'block';
          formFeedback.style.color = '#16a34a';
          formFeedback.innerText = 'ကျေးဇူးတင်ပါသည်။ သင့်တိုင်ကြားချက်ကို လက်ခံရရှိပြီး သင့်ထံ အကြောင်းပြန်ပေးပါမည်။';
          form.reset();
        } else {
          console.log(response);
          formFeedback.style.display = 'block';
          formFeedback.style.color = '#dc2626';
          formFeedback.innerText = json.message || 'စာပို့၍ မရသေးပါ။ ခဏအကြာမှ ပြန်လည် ကြိုးစားပါ။';
        }
      })
      .catch(error => {
        console.log(error);
        formFeedback.style.display = 'block';
        formFeedback.style.color = '#dc2626';
        formFeedback.innerText = 'အင်တာနက် အဆက်အသွယ် သို့မဟုတ် လိုင်းအခက်အခဲ ရှိနေပါသည်။';
      })
      .then(function () {
        submitBtn.disabled = false;
        btnSpan.innerText = originalText;
        setTimeout(() => {
          formFeedback.style.display = 'none';
        }, 5000);
      });
  });
}

const CITIES = {
  thaton: { name: "သထုံ (Thaton)", lat: 16.9152, lon: 97.3662 },
  mawlamyine: { name: "မော်လမြိုင် (Mawlamyine)", lat: 16.4914, lon: 97.6256 },
  mudon: { name: "မုဒုံ (Mudon)", lat: 16.2578, lon: 97.7172 },
  thanbyuzayat: { name: "သံဖြူဇရပ် (Thanbyuzayat)", lat: 15.9617, lon: 97.7317 },
  ye: { name: "ရေး (Ye)", lat: 15.2536, lon: 97.8542 },
  chaungzon: { name: "ချောင်းဆုံ (Chaungzon)", lat: 16.4383, lon: 97.5583 },
  kyaikto: { name: "ကျိုက်ထို (Kyaikto)", lat: 17.3022, lon: 97.0125 },
  bilin: { name: "ဘီးလင်း (Bilin)", lat: 17.2253, lon: 97.2383 },
  paung: { name: "ပေါင် (Paung)", lat: 16.6214, lon: 97.4422 },
  kyaikmaraw: { name: "ကျိုက်မရော (Kyaikmaraw)", lat: 16.3683, lon: 97.7142 }
};

let currentCityKey = "thaton";

function getWeatherDesc(code) {
  if (code === 0) return "Clear Sky";
  if (code >= 1 && code <= 3) return "Partly Cloudy";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rainy";
  if (code >= 80 && code <= 82) return "Heavy Rain";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

function getWeatherIcon(code) {
  if (code === 0) return "fa-solid fa-sun";
  if (code >= 1 && code <= 3) return "fa-solid fa-cloud-sun";
  if (code >= 51 && code <= 67) return "fa-solid fa-cloud-rain";
  if (code >= 80) return "fa-solid fa-cloud-showers-heavy";
  return "fa-solid fa-cloud";
}

async function fetchWeatherData() {
  const city = CITIES[currentCityKey];
  document.getElementById("cityName").innerText = city.name;

  const API_URL =
    "https://api.open-meteo.com/v1/forecast?latitude=" + city.lat + "&longitude=" + city.lon + "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover" + "&hourly=temperature_2m,precipitation_probability,weather_code" + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" + "&timezone=auto";

  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    // 1. Fill Left Side Temp & Header
    const cur = data.current;
    document.getElementById("currentTemp").innerText = Math.round(cur.temperature_2m) + "°";
    document.getElementById("weatherDesc").innerText = getWeatherDesc(cur.weather_code);
    document.getElementById("weatherIcon").className = getWeatherIcon(cur.weather_code);

    // 2. Fill Left Side 1-Day Data Metric Cards
    document.getElementById("rainVal").innerText = data.daily.precipitation_sum[0] + " mm";
    document.getElementById("windVal").innerText = cur.wind_speed_10m + " km/h";
    document.getElementById("humidityVal").innerText = cur.relative_humidity_2m + " %";
    document.getElementById("cloudVal").innerText = cur.cloud_cover + " %";

    // 3. Fill Right Side Hourly Forecast
    const hourlyList = document.getElementById("hourlyList");
    hourlyList.innerHTML = "";
    const currentHour = new Date().getHours();

    for (let i = currentHour; i < currentHour + 24; i++) {
      const timeStr = (i === currentHour) ? "Now" : (i % 24) + ":00";
      const temp = Math.round(data.hourly.temperature_2m[i]);
      const pop = data.hourly.precipitation_probability[i];
      const icon = getWeatherIcon(data.hourly.weather_code[i]);

      const popHtml = pop > 10 ? '<span class="hourly-pop">' + pop + '%</span>' : '<span class="hourly-pop"></span>';

      const itemHtml =
        '<div class="hourly-item">' +
        '<span class="hourly-time">' + timeStr + '</span>' +
        popHtml +
        '<i class="fa-solid ' + icon + '" style="color: #ffffff; font-size: 16px;"></i>' +
        '<span class="hourly-temp">' + temp + '°</span>' +
        '</div>';

      hourlyList.innerHTML += itemHtml;
    }

    // 4. Fill Right Side 10-Day Forecast
    const dailyList = document.getElementById("dailyList");
    dailyList.innerHTML = "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 7; i++) {
      const date = new Date(data.daily.time[i]);
      const dayName = (i === 0) ? "Today" : days[date.getDay()];
      const minTemp = Math.round(data.daily.temperature_2m_min[i]);
      const maxTemp = Math.round(data.daily.temperature_2m_max[i]);

      const itemHtml =
        '<div class="daily-row">' + '<span class="daily-day">' + dayName + '</span>' +
        '<div class="daily-temp-range">' +
        '<span class="temp-min">' + minTemp + '°</span>' +
        '<div class="temp-bar-bg"><div class="temp-bar-fill" style="width: 100%;"></div></div>' +
        '<span class="temp-max">' + maxTemp + '°</span>' +
        '</div>' +
        '</div>';

      dailyList.innerHTML += itemHtml;
    }

  } catch (err) {
    console.error("API Fetch Error:", err);
  }
}

function changeCity() {
  currentCityKey = document.getElementById("citySelect").value;
  fetchWeatherData();
}

document.addEventListener("DOMContentLoaded", fetchWeatherData);


function setQuickMsg(text) {
  document.getElementById('messageBox').value = text;
}

// Reaction နှိပ်လိုက်သောအခါ LocalStorage တွင် သိမ်းဆည်းရန်နှင့် UI ပြောင်းရန်
function handleReaction(reqId, reactionType) {
  let reactedKey = 'user_reacted_' + reqId;
  let currentReact = localStorage.getItem(reactedKey);
  let textSpan = document.getElementById('reactText' + reqId);
  let btn = document.getElementById('reactBtn' + reqId);

  if (currentReact === reactionType) {
    // တူတာကို ထပ်နှိပ်ရင် React ပြန်ဖြုတ်မည် (Unreact)
    localStorage.removeItem(reactedKey);
    if (textSpan) textSpan.innerText = "Like";
    if (btn) {
      btn.classList.remove('text-danger', 'fw-bold');
      btn.style.opacity = '1';
    }
  } else {
    // အသစ်ပေးခြင်း သို့မဟုတ် Reaction ပြောင်းလဲခြင်း
    localStorage.setItem(reactedKey, reactionType);
    if (textSpan) {
      // ပေးလိုက်သော reaction စာသားကို ပထမစာလုံး အကြီးပြောင်း၍ ပေါ်စေမည်
      textSpan.innerText = reactionType.charAt(0).toUpperCase() + reactionType.slice(1);
    }
    if (btn) {
      // UI နဲ့ လိုက်ဖက်သော အနီရောင် (text-danger) နှင့် Bold ပုံစံ အမြဲပေါ်နေစေရန်
      btn.classList.add('text-danger', 'fw-bold');
      btn.style.opacity = '1';
    }
  }
  return true; // Form submission ဆက်သွားရန်
}

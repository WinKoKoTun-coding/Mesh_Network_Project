self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// App ဘက်က ဒေတာလှမ်းပို့လိုက်တာကို ဖမ်းယူပြီး Noti တွန်းတင်ခြင်း
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "TRIGGER_SOS") {
    const options = {
      body: `⚠️ ${event.data.sender}: "${event.data.text}"`,

      // 📱 [အရေးကြီးပြင်ဆင်ချက်] - ဖုန်းတုန်ခါမှုစနစ်ကို ပိုမိုပြင်းထန်စေရန် ချိန်ညှိခြင်း
      vibrate: [500, 200, 500, 200, 800, 200, 1000],

      tag: "sos-alert",
      requireInteraction: true, // အသုံးပြုသူ နှိပ်ပြီး ဖယ်ထုတ်လိုက်သည်အထိ Noti ကတ်ပြား ပေါ်နေစေရန်

      // 🔊 [အသံစနစ်တိုးမြှင့်ခြင်း] - Android System အား Noti အသံကို ပုံမှန်အသံထက် အမြင့်ဆုံးအတိုင်း တွန်းပေးရန် ခိုင်းခြင်း
      sound:
        "https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg",

      // Android System တွက် ဦးစားပေး အမြင့်ဆုံး သတ်မှတ်ချက်
      priority: "high",

      data: {
        url: self.registration.scope, // Noti ကို နှိပ်ရင် ကိုယ့် Website ဆီ ပြန်ရောက်စေရန်
      },
    };

    event.waitUntil(
      self.registration.showNotification("🚨 EMERGENCY SOS BROADCAST", options),
    );
  }
});

// User က Noti တက်လာတာကို နှိပ်လိုက်လျှင် Browser/App အလိုအလျောက် ပွင့်လာစေရန်
self.addEventListener("notificationclick", function (event) {
  event.notification.close(); // Noti ကတ်ပြားကို ပိတ်မည်

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow(event.notification.data.url);
      }),
  );
});

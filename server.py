import datetime
import math
import asyncio
from bleak import BleakScanner
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import time
import random
import ctypes
from ctypes import wintypes
import socket
import json
import os
from collections import deque
import base64

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/')
def index():
    return app.send_static_file('index.html')

# Global Caches & Lock
devices_cache = {}
bleak_rssi_cache = {}  
messages_cache = []    
cache_lock = threading.Lock()  

# 💾 ၂၄ နာရီစာ စာတိုများ သိမ်းဆည်းမည့် JSON File Database
HISTORY_FILE = "chat_history.json"

# Signal Filter
device_rssi_history = {}

# Network Configuration for Hybrid Socket
UDP_PORT = 11000

# --- Windows Core Structures Setup ---
class BLUETOOTH_DEVICE_SEARCH_PARAMS(ctypes.Structure):
    _fields_ = [
        ('dwSize', wintypes.DWORD),
        ('fReturnAuthenticated', wintypes.BOOL),
        ('fReturnRemembered', wintypes.BOOL),
        ('fReturnUnknown', wintypes.BOOL),
        ('fReturnConnected', wintypes.BOOL),
        ('fIssueInquiry', wintypes.BOOL),
        ('cTimeoutMultiplier', ctypes.c_ubyte),
        ('hRadio', wintypes.HANDLE)
    ]

class BLUETOOTH_ADDRESS(ctypes.Structure):
    _fields_ = [('ullLong', ctypes.c_uint64)]

class BLUETOOTH_DEVICE_INFO(ctypes.Structure):
    _fields_ = [
        ('dwSize', wintypes.DWORD),
        ('Address', BLUETOOTH_ADDRESS),
        ('ulClassofDevice', wintypes.ULONG),
        ('fConnected', wintypes.BOOL),
        ('fRemembered', wintypes.BOOL),
        ('fAuthenticated', wintypes.BOOL),
        ('stLastSeen', wintypes.WORD * 8),
        ('stLastUsed', wintypes.WORD * 8),
        ('szName', ctypes.c_wchar * 248)
    ]

# 💾 Server စတက်ချိန်တွင် ဖိုင်ဟောင်းရှိက ဖတ်ယူပြီး ၂၄ နာရီစာ စစ်ထုတ်ရန် Logic
def load_history():
    global messages_cache
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                current_time = time.time()
                # ၁ ရက်စာ (၈၆၄၀၀ စက္ကန့်) အတွင်းရှိသော စာများကိုသာ ပြန်ယူမည်
                with cache_lock:
                    messages_cache = [m for m in saved if current_time - m.get("timestamp", 0) < 86400]
                print(f"📦 Loaded {len(messages_cache)} messages from 24-hour history backup.")
        except Exception as e:
            print(f"⚠️ Error loading history file: {e}")

def save_history():
    global messages_cache  # 🔴 Global variable ကို ခွင့်ပြုချက်တောင်းရန် ဤနေရာတွင် ထည့်ပါ
    
    # cache_lock ရှိပါက သုံးပါ (မရှိလျှင် ဖြုတ်လို့ရသည်)
    if cache_lock:
        cache_lock.acquire()
        
    try:
        current_time = time.time()
        twenty_four_hours = 24 * 60 * 60  # ၂၄ နာရီ (စက္ကန့်ဖြင့်)
        
        recent_messages = []
        expired_messages = []
        
        # မက်ဆေ့ချ် တစ်ခုချင်းစီကို ၂၄ နာရီ ကျော် မကျော် စစ်ဆေးခြင်း
        for msg in messages_cache:
            # msg ထဲတွင် timestamp ပါရှိရပါမည် (ဥပမာ - msg['timestamp'] = time.time())
            msg_time = msg.get('timestamp', current_time)
            
            if current_time - msg_time > twenty_four_hours:
                expired_messages.append(msg)
            else:
                recent_messages.append(msg)
                
        # ၂၄ နာရီ ကျော်သွားသော မက်ဆေ့ချ်များ ရှိပါက old_history သို့ ရက်စွဲအလိုက် သိမ်းမည်
        if expired_messages:
            os.makedirs("old_history", exist_ok=True)
            date_str = time.strftime("%Y-%m-%d")
            archive_file = os.path.join("old_history", f"chat_history_{date_str}.json")
            
            # နေ့စွဲအလိုက် ရှိနှင့်ပြီးသား JSON ထဲသို့ ပေါင်းထည့်ရန်
            existing_archive = []
            if os.path.exists(archive_file):
                try:
                    with open(archive_file, "r", encoding="utf-8") as af:
                        existing_archive = json.load(af)
                except Exception:
                    existing_archive = []
                    
            existing_archive.extend(expired_messages)
            
            with open(archive_file, "w", encoding="utf-8") as af:
                json.dump(existing_archive, af, ensure_ascii=False, indent=4)
                
        # လက်ရှိ ၂၄ နာရီအတွင်း မက်ဆေ့ချ်များကိုသာ messages_cache တွင် ဆက်လက်ထားမည်
        messages_cache = recent_messages
        
        # ပင်မ chat_history.json ကို ယာယီဖိုင်ဖြင့် လုံခြုံစွာ သိမ်းဆည်းခြင်း (WinError 5 ကာကွယ်ရန်)
        temp_file = HISTORY_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(messages_cache, f, ensure_ascii=False, indent=4)
        if os.path.exists(HISTORY_FILE):
            os.remove(HISTORY_FILE)
        os.rename(temp_file, HISTORY_FILE)
        
    except Exception as e:
        print(f"⚠️ Error saving history file: {e}")
    finally:
        if cache_lock:
            cache_lock.release()

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def rssi_to_meters(rssi, tx_power=-59, is_rainy=True):
    if rssi == 0:
        return 0.0
    try:
        n = 3.8 if is_rainy else 2.8
        ratio = (tx_power - rssi) / (10 * n)
        distance = math.pow(10, ratio)
        return round(distance, 1)
    except Exception:
        return 2.0

def filter_rssi(mac, new_rssi):
    with cache_lock:
        if mac not in device_rssi_history:
            device_rssi_history[mac] = deque(maxlen=5)
        device_rssi_history[mac].append(new_rssi)
        return sum(device_rssi_history[mac]) / len(device_rssi_history[mac])

# --- 1. Bleak Background RSSI Scanner ---
def ble_detection_callback(device, advertisement_data):
    global bleak_rssi_cache, devices_cache
    mac_address = device.address.upper()
    current_time = time.time()
    
    smooth_rssi = filter_rssi(mac_address, advertisement_data.rssi)
    
    with cache_lock:
        bleak_rssi_cache[mac_address] = {
            "rssi": smooth_rssi,
            "timestamp": current_time
        }
    
    raw_name = advertisement_data.local_name or device.name
    display_name = raw_name if (raw_name and raw_name.strip()) else f"Bluetooth Device ({mac_address[-5:]})"
    calculated_meters = rssi_to_meters(smooth_rssi, tx_power=-59, is_rainy=True)
    
    with cache_lock:
        if mac_address in devices_cache:
            devices_cache[mac_address].update({
                "distance": max(0.5, calculated_meters),
                "rssi": int(smooth_rssi),
                "isRealTimeRssi": True,
                "last_seen": current_time
            })
        else:
            devices_cache[mac_address] = {
                "id": mac_address,
                "mac": mac_address,
                "name": display_name,
                "deviceName": display_name,
                "distance": max(0.5, calculated_meters),
                "rssi": int(smooth_rssi),
                "isRealTimeRssi": True,
                "last_seen": current_time
            }

async def run_bleak_scanner():
    print("📡 Bleak RSSI Sniffer Sub-Engine Started...")
    try:
        scanner = BleakScanner(
            detection_callback=ble_detection_callback, 
            scanning_mode="active",
            scanning_options={"interval": 30, "window": 30}
        )
        await scanner.start()
        while True:
            await asyncio.sleep(0.5)
    except Exception as e:
        print(f"⚠️ Bleak Scanner Error: {e}")

def start_bleak_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_bleak_scanner())
    except Exception as e:
        print(f"⚠️ Bleak Loop Exception: {e}")

# --- 2. Windows Native Inquiry Scan ---
def native_windows_inquiry_scan():
    global devices_cache, bleak_rssi_cache
    try:
        bth = ctypes.windll.LoadLibrary("bthprops.cpl")
        bth.BluetoothFindFirstDevice.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        bth.BluetoothFindFirstDevice.restype = wintypes.HANDLE
        bth.BluetoothFindNextDevice.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
        bth.BluetoothFindNextDevice.restype = wintypes.BOOL
        bth.BluetoothFindDeviceClose.argtypes = [wintypes.HANDLE]
        bth.BluetoothFindDeviceClose.restype = wintypes.BOOL
    except Exception as e:
        print(f"⚠️ DLL Binding Error: {e}")
        return

    print("📡 Windows Hardware Bluetooth Inquiry Engine Started...")
    
    while True:
        try:
            search_params = BLUETOOTH_DEVICE_SEARCH_PARAMS()
            search_params.dwSize = ctypes.sizeof(BLUETOOTH_DEVICE_SEARCH_PARAMS)
            search_params.fReturnAuthenticated = True
            search_params.fReturnRemembered = True
            search_params.fReturnUnknown = True
            search_params.fReturnConnected = True
            search_params.fIssueInquiry = True
            search_params.cTimeoutMultiplier = 2 
            search_params.hRadio = None

            device_info = BLUETOOTH_DEVICE_INFO()
            device_info.dwSize = ctypes.sizeof(BLUETOOTH_DEVICE_INFO)

            current_time = time.time()
            temp_devices = {}

            h_find = bth.BluetoothFindFirstDevice(ctypes.byref(search_params), ctypes.byref(device_info))
            
            if h_find and h_find != 0:
                try:
                    while True:
                        addr_int = device_info.Address.ullLong
                        mac_bytes = [(addr_int >> (i * 8)) & 0xff for i in range(5, -1, -1)]
                        mac_address = ":".join(f"{b:02X}" for b in mac_bytes)
                        
                        device_name = device_info.szName
                        if not device_name.strip():
                            device_name = f"Bluetooth Device ({mac_address[-5:]})"

                        with cache_lock:
                            has_recent_cache = mac_address in bleak_rssi_cache and (current_time - bleak_rssi_cache[mac_address]["timestamp"] < 10.0)
                            cached_item = bleak_rssi_cache.get(mac_address)

                        if has_recent_cache and cached_item:
                            rssi = cached_item["rssi"]
                            calculated_meters = rssi_to_meters(rssi, tx_power=-59, is_rainy=True)
                            is_simulated = False
                        else:
                            old_dev = None
                            with cache_lock:
                                old_dev = devices_cache.get(mac_address)
                            
                            if old_dev:
                                step = random.choice([-3, -2, -1, 0, 1, 2, 3])
                                rssi = max(-85, min(-50, old_dev["rssi"] + step))
                            else:
                                rssi = random.randint(-75, -60)
                            
                            smooth_rssi = filter_rssi(mac_address, rssi)
                            calculated_meters = rssi_to_meters(smooth_rssi, tx_power=-59, is_rainy=True)
                            is_simulated = True

                        temp_devices[mac_address] = {
                            "id": mac_address,
                            "mac": mac_address,
                            "name": device_name,
                            "deviceName": device_name,
                            "distance": max(0.5, calculated_meters),
                            "rssi": int(rssi),
                            "isRealTimeRssi": not is_simulated,
                            "last_seen": current_time
                        }

                        if not bth.BluetoothFindNextDevice(h_find, ctypes.byref(device_info)):
                            break
                finally:
                    bth.BluetoothFindDeviceClose(h_find)

            with cache_lock:
                for mac, dev in temp_devices.items():
                    devices_cache[mac] = dev

        except Exception as e:
            print(f"⚠️ Engine Scan Error: {e}")
            
        time.sleep(1.0)

# --- 3. Offline Hybrid Network (Shared IP Environment / Thread Reply Support) ---
def offline_socket_listener():
    global messages_cache
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    except Exception:
        pass
    
    try:
        sock.bind(('0.0.0.0', UDP_PORT))
        print(f"📡 Hybrid Local Net Engine bound on Port {UDP_PORT}... Listening")
    except Exception as e:
        print(f"⚠️ Socket Bind Error: {e}")
        sock.close()
        return

    while True:
        try:
            data, addr = sock.recvfrom(65536)  
            payload = json.loads(data.decode('utf-8'))
            
            payload["received_at"] = time.time()
            
            if "sender_ip" not in payload or not payload["sender_ip"]:
                payload["sender_ip"] = addr[0]
            
            if "sender_name" not in payload or not payload["sender_name"]:
                payload["sender_name"] = f"User-{addr[0][-4:]}"

            with cache_lock:
                if payload.get("is_reply_packet"):
                    parent_id = payload.get("parent_msg_id")
                    new_type = payload.get("new_type") 
                    for msg in messages_cache:
                        if str(msg.get("msg_id")) == str(parent_id) or str(msg.get("id")) == str(parent_id):
                            if "replies" not in msg:
                                msg["replies"] = []

                            if new_type:
                                msg["type"] = new_type
                            
                            if not any(r.get("reply_id") == payload["reply_data"]["reply_id"] for r in msg["replies"]):
                                msg["replies"].append(payload["reply_data"])
                                if new_type and msg.get("type") != new_type:
                                    msg["type"] = new_type
                                    print(f"🔄 Message {parent_id} updated to {new_type}")
                            break
                else:
                    target_id = payload.get("msg_id") or payload.get("id")
                    if not any((msg.get("msg_id") == target_id or msg.get("id") == target_id) for msg in messages_cache):
                        messages_cache.append(payload)
                        if len(messages_cache) > 200:
                            messages_cache.pop(0)
                            
            save_history()
        except Exception:
            time.sleep(0.5)

# --- ကိုယ့်စက်ရဲ့ IP ကို သိရှိနိုင်စေရန် လှမ်းမေးရမည့် API Route ---
@app.route('/api/my_ip', methods=['GET'])
def get_client_ip():
    if request.headers.getlist("X-Forwarded-For"):
        ip = request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    else:
        ip = request.remote_addr
    return jsonify({"ip": ip})

client_ip_mapping = {} 
client_name_mapping = {} 

@app.route('/api/peers', methods=['GET'])
def get_peers():
    current_time = time.time()
    with cache_lock:
        for mac, dev in list(devices_cache.items()):
            if current_time - dev["last_seen"] > 30.0: 
                devices_cache.pop(mac, None)
        device_list = list(devices_cache.values())
        
    total = len(device_list)
    for index, device in enumerate(device_list):
        device["isActive"] = (current_time - device["last_seen"]) < 35.0
        
        matched_ip = None
        for cid, chat_name in client_name_mapping.items():
            if chat_name.lower() in device["name"].lower() or device["name"].lower() in chat_name.lower():
                matched_ip = client_ip_mapping.get(cid)
                break
                
        if matched_ip:
            device["ip"] = matched_ip
        else:
            if "ip" not in device or not device["ip"]:
                device["ip"] = f"192.168.43.{random.randint(2, 254)}"

        if not device.get("isRealTimeRssi") or device.get("isActive"):
            mac_seed = sum(ord(c) for c in device["id"])
            wave = math.sin(current_time + mac_seed) * 0.4
            raw_distance = device["distance"]
            device["distance"] = max(0.5, round(raw_distance + wave, 1))
        
        base_angle = (index * (360 / max(1, total))) % 360
        device["angle"] = (base_angle + sum(ord(c) for c in device["id"]) % 20) % 360
        
    return jsonify(device_list)

# 🌐 **[NEW ADDED]** ဖုန်းများ ဝင်လာသည့်အခါ Active Count (Mesh User Count) ကို Dynamic ဖြင့် ထုတ်ပေးမည့် API Endpoint
@app.route('/api/active_count', methods=['GET'])
def get_active_count():
    current_time = time.time()
    with cache_lock:
        # 30 စက္ကန့်အတွင်း လှုပ်ရှားမှုရှိသော သို့မဟုတ် ဝင်ရောက်ထားသော registered clients များနှင့် active devices များကို တွက်ချက်ခြင်း
        active_devices = [dev for dev in devices_cache.values() if (current_time - dev.get("last_seen", 0)) < 35.0]
        # registered client အရေအတွက်နှင့် active device အရေအတွက်ထဲမှ အများဆုံး (သို့မဟုတ် ပေါင်းစပ်ထားသော အရေအတွက်) ကို ယူမည်
        total_count = max(len(active_devices), len(client_ip_mapping))
    return jsonify({"count": total_count})

@app.route('/api/register_client', methods=['POST'])
def register_client():
    data = request.json or {}
    client_id = data.get("client_id")
    chat_name = data.get("chat_name")
    
    if request.headers.getlist("X-Forwarded-For"):
        client_ip = request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    else:
        client_ip = request.remote_addr
        
    if client_id:
        with cache_lock:
            client_ip_mapping[client_id] = client_ip
            if chat_name:
                client_name_mapping[client_id] = chat_name
            
        print(f"🔗 [Client Connected] Name: {chat_name} | IP: {client_ip} | ID: {client_id}")
        return jsonify({"status": "success", "ip": client_ip})
    return jsonify({"status": "error", "message": "Missing client_id"}), 400

# 📢 [Public Messages Get Engine]
@app.route('/api/messages', methods=['GET'])
def get_messages():
    current_time = time.time()
    with cache_lock:
        valid_messages = [m for m in messages_cache if current_time - m.get("timestamp", 0) < 86400]
        sorted_messages = sorted(valid_messages, key=lambda x: x.get("timestamp", 0), reverse=True)
        return jsonify(sorted_messages)

@app.route('/api/send_sos', methods=['POST'])
def send_sos():
    data = request.json or {}
    text = data.get("text", "")
    rescue_contact = data.get("rescue_contact", "")
    sender_name = data.get("sender_name", socket.gethostname())
    sender_id = data.get("sender_id", "server_pc")
    
    image_data = data.get("image_data", None)
    audio_data = data.get("audio_data", None)
    
    if request.headers.getlist("X-Forwarded-For"):
        sender_ip = request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    else:
        sender_ip = request.remote_addr

    msg_type = "SOS" if rescue_contact else "PUBLIC"
    generated_id = f"msg_{int(time.time() * 1000)}_{random.randint(100,999)}"

    payload = {
        "id": generated_id,
        "msg_id": generated_id,
        "type": msg_type,
        "is_emergency": True if msg_type == "SOS" else False,
        "is_broadcast_alert": True if msg_type == "SOS" else False,
        "sender_name": sender_name,
        "sender_ip": sender_ip,
        "sender_id": sender_id,
        "text": text,
        "rescue_contact": rescue_contact,
        "image_data": image_data,  
        "audio_data": audio_data,  
        "timestamp": time.time(),
        "replies": []
    }
    
    # 🛠️ [WinError 10040 Fix] ပုံ သို့မဟုတ် အသံဖိုင်ပါလာပါက UDP Broadcast မလုပ်ဘဲ Server Database သက်သက်တွင်သာ သိမ်းမည်
    has_media = bool(image_data or audio_data)
    
    if not has_media:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        except Exception:
            pass

        try:
            sock.sendto(json.dumps(payload).encode('utf-8'), ('255.255.255.255', UDP_PORT))
        except Exception as e:
            print(f"⚠️ UDP Broadcast Send Error: {e}")
        finally:
            sock.close()
    else:
        print("📁 Media attached in SOS: Skipped UDP broadcast (Stored in Server Database to prevent WinError 10040).")

    with cache_lock:
        if not any(msg.get("msg_id") == payload["msg_id"] for msg in messages_cache):
            messages_cache.append(payload)
            if len(messages_cache) > 200:
                messages_cache.pop(0)
    
    save_history()
    return jsonify({"status": "success", "message": "Message Saved and Processed!"})

# 💬 [Thread Reply API Route]
@app.route('/api/reply_message', methods=['POST', 'OPTIONS'])
def reply_message():
    if request.method == 'OPTIONS':
        return '', 200

    data = request.json or {}
    parent_msg_id = data.get("parent_msg_id")
    text = data.get("text", "")
    sender_name = data.get("sender_name", "Anonymous")
    sender_id = data.get("sender_id", "anonymous")
    is_rescue = data.get("is_rescue", False) 
    
    image_data = data.get("image_data", None)
    audio_data = data.get("audio_data", None)
    
    requested_new_type = data.get("new_type", "PUBLIC")
    
    if not parent_msg_id or not text and not image_data and not audio_data:
        return jsonify({"status": "error", "message": "အချက်အလက် လွဲမှားနေပါသည်!"}), 400
        
    reply_data = {
        "reply_id": f"rep_{int(time.time() * 1000)}_{random.randint(100,999)}",
        "sender_name": sender_name,
        "sender_id": sender_id,
        "text": text,
        "image_data": image_data,  
        "audio_data": audio_data,  
        "timestamp": time.time(),
        "is_rescue": is_rescue 
    }
    
    parent_found = False
    determined_new_type = "PUBLIC"

    with cache_lock:
        for msg in messages_cache:
            if str(msg.get("msg_id")) == str(parent_msg_id) or str(msg.get("id")) == str(parent_msg_id):
                if "replies" not in msg:
                    msg["replies"] = []
                
                if not any(r.get("reply_id") == reply_data["reply_id"] for r in msg["replies"]):
                    msg["replies"].append(reply_data)
                    
                    current_type = msg.get("type", "PUBLIC")
                    
                    if is_rescue or requested_new_type == "RESCUE":
                        msg["type"] = "RESCUE"
                        determined_new_type = "RESCUE"
                    elif current_type == "SOS":
                        msg["type"] = "SOS"
                        determined_new_type = "SOS"
                    else:
                        msg["type"] = requested_new_type
                        determined_new_type = requested_new_type
                        
                parent_found = True
                break
                
    if parent_found:
        save_history()
        
        sync_payload = {
            "is_reply_packet": True,
            "parent_msg_id": parent_msg_id,
            "reply_data": reply_data,
            "new_type": determined_new_type 
        }
        
        # 🛠️ [WinError 10040 Fix] Reply တွင် ပုံ သို့မဟုတ် အသံဖိုင်ပါလာပါက UDP Broadcast မလုပ်ပါ
        has_reply_media = bool(image_data or audio_data)
        
        if not has_reply_media:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            except Exception:
                pass

            try:
                sock.sendto(json.dumps(sync_payload).encode('utf-8'), ('255.255.255.255', UDP_PORT))
            except Exception as e:
                print(f"⚠️ Reply UDP Broadcast Error: {e}")
            finally:
                sock.close()
        else:
            print("📁 Media attached in Reply: Skipped UDP broadcast (Stored in Server Database to prevent WinError 10040).")
            
        return jsonify({"status": "success", "message": "Reply Added and Saved!"})
        
    return jsonify({"status": "error", "message": "မူရင်း စာတိုအား ရှာမတွေ့ပါဗျာ!"}), 404


@app.route('/api/delete_message/<msg_id>', methods=['DELETE'])
def delete_message(msg_id):
    global messages_cache
    deleted = False
    with cache_lock:
        for msg in messages_cache:
            if str(msg.get("id")) == str(msg_id) or str(msg.get("msg_id")) == str(msg_id):
                # ပုံ သို့မဟုတ် အသံဖိုင်ကိုသာ ဖြုတ်ချင်ပါက (Cancel လုပ်လိုပါက)
                msg["image_data"] = None
                msg["audio_data"] = None
                deleted = True
                break
    if deleted:
        save_history()
        return jsonify({"status": "success", "message": "Media cancelled and removed!"})
    return jsonify({"status": "error", "message": "Message not found"}), 404

@app.route('/api/send', methods=['POST'])
def send_message():
    global messages_cache
    
    # Frontend မှ ပို့လိုက်သော Data ကို ရယူခြင်း (JSON သို့မဟုတ် Form-data)
    data = request.json or request.form
    
    sender = data.get("sender", "Unknown")
    text = data.get("text", "")
    media_data = data.get("media", None) # Base64 ပုံ သို့မဟုတ် အသံဖိုင်
    
    media_filename = None
    if media_data:
        try:
            # Base64 data တွင် comma (,) ပါရှိမပါ စစ်ဆေးပြီး ခွဲထုတ်ခြင်း
            if "," in media_data:
                header, encoded = media_data.split(",", 1)
            else:
                header = ""
                encoded = media_data

            # File Extension သတ်မှတ်ခြင်း (Audio သို့မဟုတ် Image)
            if "audio" in header or "webm" in header:
                file_extension = "webm"
            elif "wav" in header:
                file_extension = "wav"
            elif "image" in header or "png" in header or "jpeg" in header:
                file_extension = "png"
            else:
                file_extension = "webm" # Default အနေဖြင့် အသံဖိုင် သတ်မှတ်ရန်
            
            file_data = base64.b64decode(encoded)
            media_filename = f"media_{int(time.time())}_{int(os.urandom(2).hex(), 16)}.{file_extension}"
            file_path = os.path.join(UPLOAD_FOLDER, media_filename)
            
            with open(file_path, "wb") as fh:
                fh.write(file_data)
        except Exception as e:
            print(f"⚠️ Media save error: {e}")

    # မက်ဆေ့ချ်အသစ် တည်ဆောက်ခြင်း (Timestamp ဖြင့် ၂၄ နာရီ စစ်ဆေးရန်)
    new_message = {
        "sender": sender,
        "text": text,
        "media": media_filename,
        "timestamp": time.time(), # ၂၄ နာရီ တွက်ချက်ရန် စက္ကန့်ဖြင့်
        "time": datetime.now().strftime("%d/%b/%Y %H:%M:%S") # UI တွင် ပြရန်
    }
    
    messages_cache.append(new_message)
    save_history() # History သို့ သိမ်းဆည်းမည့် Function ကို ခေါ်မည်
    
    return {"status": "success", "message": "Sent successfully"}

if __name__ == '__main__':
    load_history() 
    
    threading.Thread(target=start_bleak_loop, daemon=True).start()
    threading.Thread(target=native_windows_inquiry_scan, daemon=True).start()
    threading.Thread(target=offline_socket_listener, daemon=True).start()

    context = None
    if os.path.exists('cert.pem') and os.path.exists('key.pem'):
        context = ('cert.pem', 'key.pem')
    
    print(f"🚀 Fixed API Server Engine Running on http://127.0.0.1:7000")
    print(f"🌐 Laptop Local Network IP: {get_local_ip()}")
    
    if context:
        app.run(host='0.0.0.0', port=7000, ssl_context=context, debug=False)
    else:
        print("⚠️ SSL cert files (cert.pem/key.pem) not found. Running on standard HTTP.")
        app.run(host='0.0.0.0', port=7000, debug=False)
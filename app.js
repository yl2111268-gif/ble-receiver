'use strict';

// ═══════════════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════════════
const tabText       = document.getElementById('tabText');
const tabWave       = document.getElementById('tabWave');
const tabDebug      = document.getElementById('tabDebug');
const pageText      = document.getElementById('pageText');
const pageWave      = document.getElementById('pageWave');
const pageDebug     = document.getElementById('pageDebug');
const textDisplay   = document.getElementById('textDisplay');
const debugDisplay  = document.getElementById('debugDisplay');
const waveCanvas    = document.getElementById('waveCanvas');
const ctx           = waveCanvas.getContext('2d');
const statusEl      = document.getElementById('status');
const headerInput   = document.getElementById('headerInput');
const textTypeInput = document.getElementById('textTypeInput');
const waveTypeInput = document.getElementById('waveTypeInput');
const tailInput     = document.getElementById('tailInput');
const applyBtn      = document.getElementById('applyBtn');
const scanBtn       = document.getElementById('scanBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const simInput       = document.getElementById('simInput');
const simSendBtn     = document.getElementById('simSendBtn');
const simClearBtn    = document.getElementById('simClearBtn');

// ═══════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════
let headerBytes = [0xAA, 0x55];
let tailBytes   = [0x0D, 0x0A];  // default: CR LF
let textType    = 0x01;
let waveType    = 0x02;

function parseSettings() {
  headerBytes = hexStrToBytes(headerInput.value.trim());
  tailBytes   = hexStrToBytes(tailInput.value.trim());
  textType    = parseInt(textTypeInput.value.trim(), 16) || 0x01;
  waveType    = parseInt(waveTypeInput.value.trim(), 16) || 0x02;

  headerInput.value = headerBytes.map(function(b){return b.toString(16).padStart(2,'0').toUpperCase()}).join(' ');
  tailInput.value   = tailBytes.map(function(b){return b.toString(16).padStart(2,'0').toUpperCase()}).join(' ');
  textTypeInput.value = textType.toString(16).padStart(2,'0').toUpperCase();
  waveTypeInput.value = waveType.toString(16).padStart(2,'0').toUpperCase();
}

function hexStrToBytes(s) {
  s = s.replace(/\s+/g, '');
  if (s.length % 2 !== 0) s = '0' + s;
  var bytes = [];
  for (var i = 0; i < s.length; i += 2) {
    var b = parseInt(s.substring(i, i+2), 16);
    if (!isNaN(b)) bytes.push(b);
  }
  return bytes.length > 0 ? bytes : [0xAA, 0x55];
}

// ═══════════════════════════════════════════════════
// Tab switching
// ═══════════════════════════════════════════════════
function switchTab(activeTab, activePage) {
  var tabs = [tabText, tabWave, tabDebug];
  var pages = [pageText, pageWave, pageDebug];
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
    pages[i].classList.remove('active');
  }
  activeTab.classList.add('active');
  activePage.classList.add('active');
  if (activePage === pageWave) resizeCanvas();
}

tabText.addEventListener('click', function() { switchTab(tabText, pageText); });
tabWave.addEventListener('click', function() { switchTab(tabWave, pageWave); });
tabDebug.addEventListener('click', function() { switchTab(tabDebug, pageDebug); });

// ═══════════════════════════════════════════════════
// BLE
// ═══════════════════════════════════════════════════
let device = null, server = null, rxChar = null;

const KNOWN_UUIDS = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
  '0000ff10-0000-1000-8000-00805f9b34fb',
  '0000ffa0-0000-1000-8000-00805f9b34fb',
  '0000180a-0000-1000-8000-00805f9b34fb',
  '0000180f-0000-1000-8000-00805f9b34fb',
  '00001800-0000-1000-8000-00805f9b34fb',
  '00001801-0000-1000-8000-00805f9b34fb',
  '00001802-0000-1000-8000-00805f9b34fb',
  '00001803-0000-1000-8000-00805f9b34fb',
  '00001804-0000-1000-8000-00805f9b34fb',
  '00001812-0000-1000-8000-00805f9b34fb',
  '0000180d-0000-1000-8000-00805f9b34fb',
  '00001809-0000-1000-8000-00805f9b34fb',
  '00001810-0000-1000-8000-00805f9b34fb',
  '00001816-0000-1000-8000-00805f9b34fb',
  '0000181a-0000-1000-8000-00805f9b34fb',
  '0000181c-0000-1000-8000-00805f9b34fb',
  '0000181d-0000-1000-8000-00805f9b34fb',
  '0000181e-0000-1000-8000-00805f9b34fb',
  '00001808-0000-1000-8000-00805f9b34fb'
];

let byteCountElBacking = 0;

function setStatus(state) {
  statusEl.className = 'status ' + state;
  statusEl.textContent = state === 'connected' ? '已连接' : '未连接';
}

function onDisconnect() {
  setStatus('disconnected');
  scanBtn.disabled = false;
  disconnectBtn.disabled = true;
  device = null; server = null; rxChar = null;
}

async function connectBLE(dev) {
  setStatus('connecting');
  dev.addEventListener('gattserverdisconnected', onDisconnect);
  server = await dev.gatt.connect();

  for (var i = 0; i < KNOWN_UUIDS.length; i++) {
    try {
      var svc = await server.getPrimaryService(KNOWN_UUIDS[i]);
      var chars = await svc.getCharacteristics();
      for (var j = 0; j < chars.length; j++) {
        if (chars[j].properties.notify) {
          rxChar = chars[j];
          break;
        }
      }
      if (!rxChar) {
        for (var k = 0; k < chars.length; k++) {
          if (chars[k].properties.read) { rxChar = chars[k]; break; }
        }
      }
      if (rxChar) break;
    } catch (_) { /* try next UUID */ }
  }

  if (!rxChar) throw new Error('未找到可用特征值');

  if (rxChar.properties.notify) {
    await rxChar.startNotifications();
    rxChar.addEventListener('characteristicvaluechanged', onNotify);
  }

  setStatus('connected');
  scanBtn.disabled = true;
  disconnectBtn.disabled = false;
}

scanBtn.addEventListener('click', async function() {
  if (!navigator.bluetooth) {
    textDisplay.textContent = '错误: 当前浏览器不支持 Web Bluetooth\n\n请使用 Chrome 浏览器打开此页面。\n\n如果你在用微信/QQ 等 App 打开，请点右上角菜单 → 在浏览器中打开。';
    return;
  }
  scanBtn.disabled = true;
  try {
    var dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_UUIDS
    });
    await connectBLE(dev);
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      textDisplay.textContent = '错误: ' + e.message;
    }
    setStatus('disconnected');
  }
  scanBtn.disabled = false;
});

disconnectBtn.addEventListener('click', async function() {
  if (server && server.connected) {
    try { await server.disconnect(); } catch (_) {}
  }
  onDisconnect();
});

// Simulator: send hex bytes as if from BLE
simSendBtn.addEventListener('click', function() {
  var bytes = hexStrToBytes(simInput.value.trim());
  if (bytes.length === 0) return;
  debugLog('=== 模拟发送 ' + bytes.length + ' 字节: ' + bytesToHex(bytes) + ' ===', 'info');
  for (var i = 0; i < bytes.length; i++) {
    parseByte(bytes[i]);
  }
});

simClearBtn.addEventListener('click', function() {
  debugLines = [];
  debugDisplay.innerHTML = '';
  // Also reset waveform
  wavePtr = 0;
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, waveW, waveH);
  textDisplay.textContent = '等待数据...';
});

// ═══════════════════════════════════════════════════
// Frame parser state machine
// States: 0=search header, 1=read type, 2=read len(wave), 3=read data(wave), 4=accumulate tail(text)
// ═══════════════════════════════════════════════════
var parseState = 0;
var headerMatch = 0;
var tailMatch   = 0;
var frameType = 0;
var frameLen = 0;
var frameData = [];

function parseByte(b) {
  if (parseState === 0) {
    // Searching for header
    if (b === headerBytes[headerMatch]) {
      headerMatch++;
      if (headerMatch >= headerBytes.length) {
        headerMatch = 0;
        parseState = 1;
        debugLog('帧头匹配 ' + bytesToHex(headerBytes), 'info');
      }
    } else {
      headerMatch = (b === headerBytes[0]) ? 1 : 0;
    }
    return;
  }

  if (parseState === 1) {
    // Read type byte, decide mode
    frameType = b;
    frameData = [];
    var typeHex = b.toString(16).padStart(2, '0').toUpperCase();
    if (frameType === textType) {
      tailMatch = 0;
      parseState = 4;
      debugLog('类型=文本(0x' + typeHex + '), 等待帧尾 ' + bytesToHex(tailBytes), 'info');
    } else if (frameType === waveType) {
      parseState = 2;
      debugLog('类型=波形(0x' + typeHex + '), 等待长度字节', 'info');
    } else {
      parseState = 2;
      debugLog('类型=未知(0x' + typeHex + '), 将按长度模式解析', 'err');
    }
    return;
  }

  if (parseState === 2) {
    frameLen = b || 256;
    if (frameLen === 0) {
      dispatchFrame(frameType, []);
      parseState = 0;
    } else {
      parseState = 3;
    }
    return;
  }

  if (parseState === 3) {
    // Waveform data: collect until length reached
    frameData.push(b);
    if (frameData.length >= frameLen) {
      dispatchFrame(frameType, frameData);
      parseState = 0;
    }
    return;
  }

  if (parseState === 4) {
    // Text mode: accumulate, check for tail
    if (tailBytes.length > 0 && b === tailBytes[tailMatch]) {
      tailMatch++;
      if (tailMatch >= tailBytes.length) {
        // Tail found — strip tail, dispatch frame
        tailMatch = 0;
        dispatchFrame(frameType, frameData);
        parseState = 0;
        return;
      }
    } else {
      // Flush partially-matched tail bytes into data
      if (tailMatch > 0) {
        for (var ti = 0; ti < tailMatch; ti++) {
          frameData.push(tailBytes[ti]);
          if (frameData.length > 65536) { parseState = 0; return; }
        }
        tailMatch = 0;
        // Re-check this byte against tail start
        if (tailBytes.length > 0 && b === tailBytes[0]) {
          tailMatch = 1;
          return;
        }
      }
      frameData.push(b);
    }
    // Safety: max 64KB text data, then give up
    if (frameData.length > 65536) {
      dispatchFrame(frameType, frameData);
      parseState = 0;
    }
  }
}

function dispatchFrame(type, data) {
  var typeHex = type.toString(16).padStart(2, '0').toUpperCase();
  if (type === textType) {
    var text = new TextDecoder('utf-8').decode(new Uint8Array(data));
    debugLog('文本帧 ' + data.length + ' 字节: ' + text, 'ok');
    textDisplay.textContent = text;
  } else if (type === waveType) {
    debugLog('波形帧 ' + data.length + ' 字节: ' + bytesToHex(data), 'ok');
    drawWaveData(data);
  } else {
    debugLog('未知帧类型 0x' + typeHex + ' ' + data.length + ' 字节', 'err');
  }
}

// ═══════════════════════════════════════════════════
// Waveform drawing
// ═══════════════════════════════════════════════════
var waveData = [];      // Full data store
var wavePtr = 0;        // Current write position (wraps)
var waveW = 0, waveH = 0;

function resizeCanvas() {
  var rect = waveCanvas.parentElement.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  waveW = Math.floor(rect.width);
  waveH = Math.floor(rect.height);
  waveCanvas.width = waveW * dpr;
  waveCanvas.height = waveH * dpr;
  waveCanvas.style.width = waveW + 'px';
  waveCanvas.style.height = waveH + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  redrawWaveFull();
}

function drawWaveData(data) {
  if (waveW === 0 || waveH === 0) resizeCanvas();

  var len = data.length;
  var yMid = Math.floor(waveH / 2);

  for (var i = 0; i < len; i++) {
    var x = wavePtr % waveW;
    var rawVal = data[i];
    // Scale byte 0-255 to canvas height (inverted: 0=bottom, 255=top)
    var y = Math.round((1 - rawVal / 255) * (waveH - 2)) + 1;

    // Clear old vertical slice at this x
    ctx.fillStyle = '#06060e';
    ctx.fillRect(x, 0, 1, waveH);

    // Draw grid line every 50px
    if (x % 50 === 0) {
      ctx.fillStyle = '#0e0e1a';
      ctx.fillRect(x, 0, 1, waveH);
    }

    // Draw this point
    ctx.fillStyle = '#0f0';
    ctx.fillRect(x, y, 1, 1);

    wavePtr++;
  }

  // Draw center line reference
  ctx.fillStyle = '#0e0e1a';
  ctx.fillRect(0, yMid, waveW, 1);
}

function redrawWaveFull() {
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, waveW, waveH);

  // Grid
  ctx.fillStyle = '#0e0e1a';
  for (var gx = 0; gx < waveW; gx += 50) {
    ctx.fillRect(gx, 0, 1, waveH);
  }
  var yMid = Math.floor(waveH / 2);
  for (var gy = yMid % 50; gy < waveH; gy += 50) {
    ctx.fillRect(0, gy, waveW, 1);
  }

  // Data points
  if (wavePtr === 0) return;
  var start = Math.max(0, wavePtr - waveW);
  ctx.fillStyle = '#0f0';
  for (var i = start; i < wavePtr; i++) {
    var x = i % waveW;
    var rawVal = waveData[i] || 0;
    var y = Math.round((1 - rawVal / 255) * (waveH - 2)) + 1;
    ctx.fillRect(x, y, 1, 1);
  }

  // Center line
  ctx.fillStyle = '#0e0e1a';
  ctx.fillRect(0, yMid, waveW, 1);
}

window.addEventListener('resize', function() {
  if (pageWave.classList.contains('active')) resizeCanvas();
});

// ═══════════════════════════════════════════════════
// Debug logging
// ═══════════════════════════════════════════════════
var debugLines = [];
var debugMax = 200;

function debugLog(msg, cls) {
  var now = new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
  debugLines.push('<span class="time">[' + now + ']</span> <span class="' + (cls || '') + '">' + msg + '</span>');
  if (debugLines.length > debugMax) debugLines.shift();
  debugDisplay.innerHTML = debugLines.join('\n');
  debugDisplay.scrollTop = debugDisplay.scrollHeight;
}

function bytesToHex(arr) {
  var parts = [];
  for (var i = 0; i < arr.length; i++) {
    parts.push(arr[i].toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(' ');
}

// ═══════════════════════════════════════════════════
// BLE data handler
// ═══════════════════════════════════════════════════
function onNotify(event) {
  var bytes = new Uint8Array(event.target.value.buffer);
  debugLog('收到 ' + bytes.length + ' 字节: ' + bytesToHex(bytes), 'hex');
  for (var i = 0; i < bytes.length; i++) {
    parseByte(bytes[i]);
  }
}

// ═══════════════════════════════════════════════════
// Apply settings
// ═══════════════════════════════════════════════════
applyBtn.addEventListener('click', function() {
  parseSettings();
  parseState = 0;
  headerMatch = 0;
  textDisplay.textContent = '帧头已更新，等待数据...';
});

// Init
parseSettings();

if (!navigator.bluetooth) {
  textDisplay.textContent = '[警告] 当前浏览器不支持 Web Bluetooth\n\n请使用 Android Chrome 打开此页面。\n如果你在用微信/QQ 等 App 内打开，请点右上角 → 在浏览器中打开。';
  scanBtn.disabled = true;
}

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

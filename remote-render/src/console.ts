// Web 控制台：单文件内嵌 HTML（无构建依赖），提供实时预览、主题/字体/亮度设置与手势模拟。
// 色块与 clock-theme.ts 的调色板保持一致（展示用途，无需运行时耦合）。

export const CONSOLE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmallDesktopDisplay 控制台</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #0b0f16; color: #dbe4f0; font: 14px/1.6 -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #edf2f8; }
  .sub { color: #6f87ab; font-size: 12px; margin-bottom: 20px; }
  .layout { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  .card { background: #10151c; border: 1px solid #232c3a; border-radius: 12px; padding: 16px; }
  .preview img { width: 360px; height: 360px; image-rendering: pixelated; border-radius: 10px; display: block; background: #000; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
  .label { width: 44px; color: #8fa6c0; font-size: 13px; flex: none; }
  button { background: #1a2331; color: #d7e4f5; border: 1px solid #2c3a4f; border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
  button:hover { background: #223047; }
  button.active { background: #2e548f; border-color: #4a76b8; color: #fff; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  select, input[type=range] { accent-color: #4a76b8; background: #1a2331; color: #d7e4f5; border: 1px solid #2c3a4f; border-radius: 8px; padding: 5px 8px; }
  .status { font-size: 12px; color: #8fa6c0; white-space: pre-line; }
  .controls { min-width: 340px; max-width: 420px; }
  .toast { position: fixed; right: 20px; bottom: 20px; background: #223047; border: 1px solid #4a76b8; padding: 8px 14px; border-radius: 8px; opacity: 0; transition: opacity .25s; }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<h1>SmallDesktopDisplay 控制台</h1>
<div class="sub">远端渲染服务 · 局域网免登录</div>
<div class="layout">
  <div class="card preview">
    <div class="row"><span class="label">设备</span><select id="device"></select><button onclick="refreshAll()">刷新</button></div>
    <img id="frame" alt="预览" title="点按可立即刷新" onclick="tickPreview()">
    <div class="row">
      <span class="label">手势</span>
      <button onclick="gesture('short_press')">短按</button>
      <button onclick="gesture('double_press')">双击（强刷）</button>
      <button onclick="gesture('long_press')">长按（设置）</button>
    </div>
  </div>
  <div class="card controls">
    <div class="row"><span class="label">主题</span><span id="themes"></span></div>
    <div class="row"><span class="label">字体</span><span id="fonts"></span></div>
    <div class="row">
      <span class="label">亮度</span>
      <input type="range" id="brightness" min="0" max="100" step="5" style="flex:1">
      <span id="brightnessValue" style="width:38px;text-align:right"></span>
      <button onclick="applyBrightness()">应用</button>
    </div>
    <div class="row"><span class="label">状态</span><span class="status" id="status">加载中…</span></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const THEMES = [
  {key: "midnight", label: "Ink 石墨蓝", color: "#7d96c8"},
  {key: "dusk", label: "Dusk 暮紫", color: "#a68fd0"},
  {key: "sakura", label: "Sakura 樱粉", color: "#e08bb0"},
  {key: "amber", label: "Amber 琥珀", color: "#dda45c"},
  {key: "mono", label: "Mono 纯灰", color: "#999fa5"},
];
const FONTS = [
  {key: "lxgw_wenkai_screen", label: "霞鹜文楷"},
  {key: "maple_mono_nf_cn", label: "Maple Mono"},
  {key: "noto_cjk", label: "Noto CJK"},
];
let devices = [];
let current = localStorage.getItem("sdd-device") || "";

const $ = (id) => document.getElementById(id);
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}
async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok && response.status !== 202 && response.status !== 204) {
    throw new Error(path + " -> " + response.status);
  }
  return response;
}
function deviceInfo() { return devices.find((d) => d.deviceId === current); }

async function loadDevices() {
  const data = await (await api("/api/v1/devices")).json();
  devices = data.devices;
  if (!devices.length) { $("status").textContent = "还没有设备连接过"; return; }
  if (!devices.some((d) => d.deviceId === current)) current = devices[0].deviceId;
  $("device").innerHTML = devices.map((d) =>
    '<option value="' + d.deviceId + '"' + (d.deviceId === current ? " selected" : "") + ">" + d.deviceId + "</option>").join("");
  renderControls();
}
function renderControls() {
  const info = deviceInfo();
  $("themes").innerHTML = THEMES.map((t) =>
    '<button class="' + (info && info.themeKey === t.key ? "active" : "") + '" onclick="setPref(\\'themeKey\\',\\'' + t.key + '\\')">' +
    '<span class="swatch" style="background:' + t.color + '"></span>' + t.label + "</button>").join(" ");
  $("fonts").innerHTML = FONTS.map((f) =>
    '<button class="' + (info && info.fontKey === f.key ? "active" : "") + '" onclick="setPref(\\'fontKey\\',\\'' + f.key + '\\')">' + f.label + "</button>").join(" ");
  if (info) {
    $("brightness").value = info.brightness;
    $("brightnessValue").textContent = info.brightness + "%";
  }
}
async function refreshStatus() {
  const data = await (await api("/api/v1/status")).json();
  const info = deviceInfo();
  const weather = data.weather.hasData
    ? data.weather.location + " 天气缓存 " + Math.round(data.weather.ageSeconds / 60) + " 分钟前"
    : "天气暂无数据（上游可能不可达，30s 自动重试）";
  $("status").textContent = weather + "\\n" +
    (info ? "页面 " + info.page + " · 亮度 " + info.brightness + "% · 帧 #" + info.frameId + " · " + info.idleSeconds + "s 前活跃" : "");
}
function tickPreview() {
  if (!current) return;
  $("frame").src = "/api/v1/devices/" + encodeURIComponent(current) + "/preview.png?t=" + Date.now();
}
async function setPref(key, value) {
  await api("/api/v1/devices/" + encodeURIComponent(current) + "/prefs", {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({[key]: value}),
  });
  toast("已应用");
  await loadDevices();
  tickPreview();
}
async function applyBrightness() {
  await api("/api/v1/devices/" + encodeURIComponent(current) + "/prefs", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({brightness: Number($("brightness").value)}),
  });
  toast("亮度指令已下发");
}
async function gesture(event) {
  await api("/api/v1/devices/" + encodeURIComponent(current) + "/console-input", {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({event}),
  });
  setTimeout(tickPreview, 150);
}
async function refreshAll() { await loadDevices(); await refreshStatus(); tickPreview(); }

$("device").addEventListener("change", (e) => {
  current = e.target.value;
  localStorage.setItem("sdd-device", current);
  renderControls();
  tickPreview();
});
$("brightness").addEventListener("input", (e) => { $("brightnessValue").textContent = e.target.value + "%"; });

refreshAll();
setInterval(tickPreview, 1000);
setInterval(refreshStatus, 5000);
setInterval(loadDevices, 10000);
</script>
</body>
</html>
`;

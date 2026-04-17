// ══════════════════════════════════════════════════════════════════════════════
// BNI Connect Multi-Page Scraper  (v15 — Background Edition)
// ──────────────────────────────────────────────────────────────────────────────
// ✦ Background-safe Web Worker timers (no throttling when tab is hidden)
// ✦ Live discovery counter during auto-scroll
// ✦ Company & City captured from the search page as fallback
// ✦ Enhanced floating control panel with phases, speed, mini-counters
// ✦ Retry queue for failed / timed-out profiles (up to 2 retries)
// ✦ Proper CSV escaping (commas, quotes, newlines, phone numbers)
// ✦ Iframe load timeout protection (20 s)
// ✦ All v14 bugs fixed
// ══════════════════════════════════════════════════════════════════════════════

(async function () {

  // ═══════════════════════════════════════════════════════════════════════════
  // WEB WORKER TIMER — runs in a separate thread, never throttled
  // ═══════════════════════════════════════════════════════════════════════════
  const _workerSrc = `self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)};`;
  const _timerWorker = new Worker(URL.createObjectURL(new Blob([_workerSrc], { type: "application/javascript" })));
  const _sleepMap = new Map();
  let _sleepId = 0;
  _timerWorker.onmessage = (e) => { const r = _sleepMap.get(e.data); if (r) { _sleepMap.delete(e.data); r(); } };
  const sleep = (ms) => new Promise((resolve) => { const id = _sleepId++; _sleepMap.set(id, resolve); _timerWorker.postMessage({ id, ms }); });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════
  const CHECKPOINT_KEY  = "bni_scraper_checkpoint_v15";
  const CONCURRENCY     = 3;
  const IFRAME_TIMEOUT  = 20000;   // ms — max wait for a profile iframe to load
  const RENDER_WAIT     = 2500;    // ms — extra render time after iframe onload
  const CHECKPOINT_EVERY = 25;     // save every N contacts
  const MAX_RETRIES     = 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUME CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  let savedCheckpoint = null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (raw) {
      savedCheckpoint = JSON.parse(raw);
      const resume = confirm(
        `[BNI Scraper v15] Found a saved session with ${savedCheckpoint.extractedData.length - 1} contacts from ${savedCheckpoint.savedAt}.\n\nOK → Resume   |   Cancel → Start fresh`
      );
      if (!resume) { localStorage.removeItem(CHECKPOINT_KEY); savedCheckpoint = null; }
    }
  } catch (_) { savedCheckpoint = null; }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const CSV_HEADERS = ["First Name","Last Name","Company Name","Category","Email","Phone Number","City","Website","Company Address","Profile URL"];
  let isPaused  = false;
  let isStopped = false;
  let loggedOut = false;

  let extractedData  = savedCheckpoint ? savedCheckpoint.extractedData : [CSV_HEADERS];
  let scrapedCount   = savedCheckpoint ? savedCheckpoint.extractedData.length - 1 : 0;
  let totalCount     = 0;
  let discoveredCount = 0;
  let startTime      = Date.now();

  let okCount = 0, partialCount = 0, failCount = 0;
  let logLines   = [];
  let retryQueue = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // WAKE LOCK
  // ═══════════════════════════════════════════════════════════════════════════
  let wakeLock = null;
  async function requestWakeLock() {
    try { if ("wakeLock" in navigator && (!wakeLock || wakeLock.released)) wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {}
  }
  await requestWakeLock();

  // Re-acquire on visibility change (Chrome releases it when hidden)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { requestWakeLock(); updateBgWarning(false); }
    else updateBgWarning(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTI-IDLE — runs on the Worker timer so it works in background tabs
  // ═══════════════════════════════════════════════════════════════════════════
  let antiIdleActive = true;
  (async function antiIdleLoop() {
    while (antiIdleActive) {
      try {
        window.scrollBy(0, 1);
        setTimeout(() => window.scrollBy(0, -1), 50);
        document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      } catch (_) {}
      await sleep(30000);
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════
  const _css = document.createElement("style");
  _css.textContent = `
    @keyframes bni-pulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
    @keyframes bni-spin   { to{transform:rotate(360deg)} }
    @keyframes bni-fade   { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }

    #bni-panel *{box-sizing:border-box}

    #bni-panel .stat-card{background:#f8fafc;border-radius:8px;padding:8px 10px;border:1px solid #f1f5f9;transition:all .2s}
    #bni-panel .stat-card:hover{background:#f1f5f9;transform:translateY(-1px)}
    #bni-panel .stat-label{font-size:10px;color:#94a3b8;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px}
    #bni-panel .stat-value{font-size:16px;font-weight:700;color:#1e293b}

    #bni-panel .phase{font-size:10px;padding:3px 8px;border-radius:4px;color:#94a3b8;background:#f8fafc;transition:all .3s}
    #bni-panel .phase.active{color:#4f46e5;background:#eef2ff;font-weight:600}
    #bni-panel .phase.done{color:#059669;background:#ecfdf5}

    #bni-panel .btn{flex:1;padding:7px 0;font-size:11px;font-weight:600;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .2s;text-transform:uppercase;letter-spacing:.3px}
    #bni-panel .btn:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.1)}
    #bni-panel .btn:active{transform:none}
    #bni-panel .btn-pause{background:#fefce8;color:#a16207;border-color:#fef08a}
    #bni-panel .btn-stop{background:#fef2f2;color:#dc2626;border-color:#fecaca}
    #bni-panel .btn-dl{background:#eff6ff;color:#2563eb;border-color:#bfdbfe}

    #bni-panel .mc{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 7px;border-radius:4px}
    #bni-panel .mc-ok{background:#ecfdf5;color:#059669}
    #bni-panel .mc-warn{background:#fffbeb;color:#d97706}
    #bni-panel .mc-fail{background:#fef2f2;color:#dc2626}

    #bni-panel .bg-warn{display:none;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;font-size:10px;color:#92400e;margin-top:8px;line-height:1.4}
    #bni-panel .bg-warn.visible{display:block;animation:bni-fade .3s}

    #bni-panel .log-e{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px;color:#64748b}
    #bni-panel .log-t{color:#94a3b8;font-size:10px;min-width:46px;flex-shrink:0}
    #bni-panel .log-d{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  `;
  document.head.appendChild(_css);

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOATING UI PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  const panel = document.createElement("div");
  panel.id = "bni-panel";
  panel.innerHTML = `
    <!-- accent bar -->
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);height:4px;border-radius:12px 12px 0 0;margin:-16px -16px 12px -16px"></div>

    <!-- header -->
    <div id="bni-hdr" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:grab">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:700;color:#1e293b">⚡ BNI Scraper</span>
        <span style="font-size:9px;color:#94a3b8;background:#f1f5f9;padding:2px 6px;border-radius:4px">v15</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span id="bni-status" style="font-size:10px;padding:3px 10px;border-radius:6px;background:#eef2ff;color:#4338ca;font-weight:600">Scanning</span>
        <button id="bni-min" style="background:none;border:none;cursor:pointer;font-size:14px;color:#94a3b8;line-height:1" title="Minimize">─</button>
      </div>
    </div>

    <!-- collapsible body -->
    <div id="bni-body">

      <!-- phases -->
      <div id="bni-phases" style="display:flex;gap:4px;align-items:center;margin-bottom:10px">
        <span class="phase active" id="ph-1">① Discover</span>
        <span style="color:#cbd5e1;font-size:10px">→</span>
        <span class="phase" id="ph-2">② Scrape</span>
        <span style="color:#cbd5e1;font-size:10px">→</span>
        <span class="phase" id="ph-3">③ Complete</span>
      </div>

      <!-- discovery card (visible during scroll phase) -->
      <div id="bni-disc" style="display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:10px 14px;margin-bottom:10px">
        <div style="width:12px;height:12px;border:2px solid #6366f1;border-top-color:transparent;border-radius:50%;animation:bni-spin .7s linear infinite;flex-shrink:0"></div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#4338ca">Scanning page…</div>
          <div style="font-size:11px;color:#6366f1" id="bni-disc-n">0 profiles discovered</div>
        </div>
      </div>

      <!-- stats 4-grid -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
        <div class="stat-card"><div class="stat-label">Scraped</div><div class="stat-value" id="s-cnt">0</div></div>
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" id="s-tot">—</div></div>
        <div class="stat-card"><div class="stat-label">ETA</div><div class="stat-value" id="s-eta">—</div></div>
        <div class="stat-card"><div class="stat-label">Speed</div><div class="stat-value" id="s-spd">—</div></div>
      </div>

      <!-- mini counters -->
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <span class="mc mc-ok">✓ <b id="mc-ok">0</b></span>
        <span class="mc mc-warn">◐ <b id="mc-w">0</b></span>
        <span class="mc mc-fail">✕ <b id="mc-f">0</b></span>
      </div>

      <!-- progress bar -->
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;margin-bottom:4px">
        <div id="bni-bar" style="background:linear-gradient(90deg,#6366f1,#8b5cf6,#a855f7);height:100%;border-radius:99px;width:0%;transition:width .4s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:10px">
        <span id="bni-pct">0 %</span>
        <span id="bni-rem">—</span>
      </div>

      <!-- buttons -->
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button class="btn btn-pause" id="btn-p">⏸ Pause</button>
        <button class="btn btn-stop"  id="btn-s">⏹ Stop</button>
        <button class="btn btn-dl"    id="btn-d">↓ CSV</button>
      </div>

      <!-- log -->
      <div id="bni-log" style="border:1px solid #e2e8f0;border-radius:8px;height:115px;overflow-y:auto;padding:6px 10px;background:#fafbfc"></div>

      <!-- bg warning -->
      <div id="bni-bgw" class="bg-warn">
        ⚠️ Tab is in background — scraping continues via Web Worker but may be slower.
        For best speed, pop this tab into its own window.
      </div>

      <!-- checkpoint -->
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:#94a3b8;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
        <div style="width:6px;height:6px;border-radius:50%;background:#059669"></div>
        <span id="bni-ck">No checkpoint yet</span>
      </div>

    </div><!-- /body -->
  `;
  Object.assign(panel.style, {
    position: "fixed", top: "20px", right: "20px", zIndex: "99999",
    width: "340px", background: "#ffffff", borderRadius: "12px",
    border: "1px solid #e2e8f0", padding: "16px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)",
    fontFamily: "'Inter','Segoe UI',system-ui,-apple-system,sans-serif",
    userSelect: "none", transition: "width .25s ease"
  });
  document.body.appendChild(panel);

  // ── minimize / maximize ────────────────────────────────────────────────────
  let minimized = false;
  document.getElementById("bni-min").addEventListener("click", () => {
    minimized = !minimized;
    const body = document.getElementById("bni-body");
    const btn  = document.getElementById("bni-min");
    body.style.display = minimized ? "none" : "block";
    btn.textContent    = minimized ? "□" : "─";
    btn.title          = minimized ? "Maximize" : "Minimize";
    panel.style.width  = minimized ? "auto" : "340px";
  });

  // ── drag ───────────────────────────────────────────────────────────────────
  const hdr = document.getElementById("bni-hdr");
  let dragging = false, dx = 0, dy = 0;
  hdr.addEventListener("mousedown", (e) => {
    if (e.target.id === "bni-min") return;
    dragging = true;
    dx = e.clientX - panel.getBoundingClientRect().left;
    dy = e.clientY - panel.getBoundingClientRect().top;
    hdr.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panel.style.left  = (e.clientX - dx) + "px";
    panel.style.top   = (e.clientY - dy) + "px";
    panel.style.right = "auto";
  });
  document.addEventListener("mouseup", () => { dragging = false; hdr.style.cursor = "grab"; });

  // ═══════════════════════════════════════════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);

  function addLog(name, status) {
    const colors = { ok: "#059669", warn: "#d97706", loading: "#6366f1", fail: "#dc2626" };
    const labels = { ok: "✓ done", warn: "◐ partial", loading: "⏳ loading", fail: "✕ failed" };
    const c = colors[status] || "#94a3b8";
    const l = labels[status] || status;
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const anim = status === "loading" ? "animation:bni-pulse 1s infinite;" : "";
    logLines.unshift(`<div class="log-e"><span class="log-t">${t}</span><div class="log-d" style="background:${c};${anim}"></div><span>${name} — ${l}</span></div>`);
    if (logLines.length > 100) logLines.pop();
    const el = $("bni-log");
    if (el) el.innerHTML = logLines.join("");
  }

  function updateUI() {
    const pct = totalCount > 0 ? Math.round((scrapedCount / totalCount) * 100) : 0;
    const remaining = totalCount - scrapedCount;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = scrapedCount > 0 ? elapsed / scrapedCount : 0;
    const etaSecs = Math.round(rate * remaining);
    const etaStr = etaSecs > 3600 ? Math.round(etaSecs / 3600) + "h" : etaSecs > 60 ? Math.round(etaSecs / 60) + "m" : etaSecs + "s";
    const speed = elapsed > 5 ? ((scrapedCount / elapsed) * 60).toFixed(1) : "—";

    if ($("s-cnt")) $("s-cnt").textContent = scrapedCount;
    if ($("s-tot")) $("s-tot").textContent = totalCount || "—";
    if ($("s-eta")) $("s-eta").textContent = scrapedCount > 0 && remaining > 0 ? etaStr : "—";
    if ($("s-spd")) $("s-spd").textContent = speed !== "—" ? speed + "/m" : "—";
    if ($("bni-bar")) $("bni-bar").style.width = pct + "%";
    if ($("bni-pct")) $("bni-pct").textContent = pct + " %";
    if ($("bni-rem")) $("bni-rem").textContent = remaining > 0 ? remaining + " left" : scrapedCount > 0 ? "🎉 done" : "—";
    if ($("mc-ok"))  $("mc-ok").textContent  = okCount;
    if ($("mc-w"))   $("mc-w").textContent   = partialCount;
    if ($("mc-f"))   $("mc-f").textContent   = failCount;
  }

  function setStatus(text, bg, fg) {
    const el = $("bni-status");
    if (el) { el.textContent = text; el.style.background = bg; el.style.color = fg; }
  }

  function setPhase(n) {
    [1, 2, 3].forEach((i) => {
      const el = $("ph-" + i);
      if (el) el.className = "phase" + (i === n ? " active" : i < n ? " done" : "");
    });
  }

  function updateBgWarning(show) {
    const el = $("bni-bgw");
    if (el) el.className = "bg-warn" + (show ? " visible" : "");
  }

  function updateDiscovery(count) {
    const el = $("bni-disc-n");
    if (el) el.textContent = `${count} profile${count !== 1 ? "s" : ""} discovered`;
  }

  function hideDiscovery() {
    const el = $("bni-disc");
    if (el) el.style.display = "none";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CSV HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function csvEscape(value) {
    if (value === null || value === undefined || value === "") return '""';
    let s = String(value)
      .replace(/"/g, '""')       // escape double-quotes
      .replace(/\r\n|\r|\n/g, " "); // flatten newlines
    return `"${s}"`;
  }

  function downloadCSV() {
    const rows = extractedData.map((row, i) => (i === 0 ? row.join(",") : row.join(",")));
    const csv  = "\uFEFF" + rows.join("\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `BNI_Export_${new Date().toISOString().split("T")[0]}_${scrapedCount}contacts.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT
  // ═══════════════════════════════════════════════════════════════════════════
  function saveCheckpoint() {
    try {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({
        extractedData,
        savedAt: new Date().toLocaleTimeString()
      }));
      const el = $("bni-ck");
      if (el) el.textContent = `Saved ${scrapedCount} contacts @ ${new Date().toLocaleTimeString()}`;
    } catch (_) {
      // localStorage may be full — clear old keys and retry
      try { localStorage.removeItem("bni_scraper_checkpoint"); } catch (_2) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTON WIRING
  // ═══════════════════════════════════════════════════════════════════════════
  $("btn-p").addEventListener("click", () => {
    if (isStopped) return;
    isPaused = !isPaused;
    const btn = $("btn-p");
    if (isPaused) {
      btn.textContent = "▶ Resume";
      btn.style.background = "#ecfdf5"; btn.style.color = "#059669"; btn.style.borderColor = "#a7f3d0";
      setStatus("Paused", "#fefce8", "#a16207");
    } else {
      btn.textContent = "⏸ Pause";
      btn.style.background = ""; btn.style.color = ""; btn.style.borderColor = "";
      setStatus("Running", "#ecfdf5", "#059669");
    }
  });

  $("btn-s").addEventListener("click", () => {
    if (confirm("Stop scraping now? You can still download what's collected.")) {
      isStopped = true;
      setStatus("Stopped", "#fef2f2", "#dc2626");
      saveCheckpoint();
    }
  });

  $("btn-d").addEventListener("click", downloadCSV);

  // ═══════════════════════════════════════════════════════════════════════════
  // COLUMN DETECTION — find Company & City columns on the search page
  // ═══════════════════════════════════════════════════════════════════════════
  function detectColumns() {
    const result = { companyIdx: -1, cityIdx: -1, nameIdx: -1, headerType: null };

    // Strategy 1: MUI DataGrid role="columnheader"
    let headers = document.querySelectorAll('[role="columnheader"]');
    if (headers.length > 0) {
      result.headerType = "datagrid";
      headers.forEach((h, i) => {
        const t = h.innerText.trim().toLowerCase();
        if (t === "name") result.nameIdx = i;
        if (t === "company" || t === "company name") result.companyIdx = i;
        if (t === "city") result.cityIdx = i;
      });
      if (result.companyIdx >= 0 || result.cityIdx >= 0) return result;
    }

    // Strategy 2: MuiBox-root elements acting as column labels
    headers = document.querySelectorAll(".MuiBox-root[column]");
    if (headers.length > 0) {
      result.headerType = "muibox";
      headers.forEach((h, i) => {
        const t = h.innerText.trim().toLowerCase();
        if (t === "name") result.nameIdx = i;
        if (t === "company" || t === "company name") result.companyIdx = i;
        if (t === "city") result.cityIdx = i;
      });
      if (result.companyIdx >= 0 || result.cityIdx >= 0) return result;
    }

    // Strategy 3: plain <th> elements
    headers = document.querySelectorAll("th");
    if (headers.length > 0) {
      result.headerType = "table";
      headers.forEach((h, i) => {
        const t = h.innerText.trim().toLowerCase();
        if (t === "name") result.nameIdx = i;
        if (t === "company" || t === "company name") result.companyIdx = i;
        if (t === "city") result.cityIdx = i;
      });
    }

    return result;
  }

  function extractRowData(linkElement, colLayout) {
    const out = { company: null, city: null };
    // Walk up to find a "row" ancestor
    let row = linkElement.closest('[role="row"]')
           || linkElement.closest("tr")
           || linkElement.closest('[class*="MuiDataGrid-row"]');

    if (!row) {
      // Heuristic: walk up until we find a container with >2 children
      let el = linkElement.parentElement;
      for (let i = 0; i < 6 && el; i++) { if (el.children.length > 2) { row = el; break; } el = el.parentElement; }
    }
    if (!row) return out;

    // ── Use DIRECT CHILDREN of the row for reliable column mapping ──
    // querySelectorAll(".MuiBox-root") was picking up deeply nested elements
    // (avatar wrappers, text boxes inside cells) causing index shifts.
    let cells;
    if (colLayout.headerType === "datagrid") {
      cells = row.querySelectorAll('[role="cell"],[role="gridcell"]');
    } else if (colLayout.headerType === "table") {
      cells = row.querySelectorAll("td");
    } else {
      // For "muibox" and any other type, use direct children
      cells = row.children;
    }

    // ── Offset auto-correction ──
    // Find which cell index contains the link element (= Name column in data).
    // Compare against the Name header index to detect and correct any mismatch
    // between header count and cell count (e.g. extra avatar/checkbox cells).
    let linkCellIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].contains(linkElement)) { linkCellIdx = i; break; }
    }
    const nameHeaderIdx = colLayout.nameIdx >= 0 ? colLayout.nameIdx : 0;
    const offset = linkCellIdx >= 0 ? (linkCellIdx - nameHeaderIdx) : 0;

    const adjCompanyIdx = colLayout.companyIdx >= 0 ? colLayout.companyIdx + offset : -1;
    const adjCityIdx    = colLayout.cityIdx    >= 0 ? colLayout.cityIdx    + offset : -1;

    if (adjCompanyIdx >= 0 && adjCompanyIdx < cells.length) {
      const txt = cells[adjCompanyIdx].innerText.trim();
      if (txt && txt.toLowerCase() !== "company") out.company = txt;
    }
    if (adjCityIdx >= 0 && adjCityIdx < cells.length) {
      const txt = cells[adjCityIdx].innerText.trim();
      if (txt && txt.toLowerCase() !== "city") out.city = txt;
    }

    // Debug: log first few rows to verify alignment
    if (searchPageData.size < 3) {
      console.log(`[BNI v15] Row extract debug: linkCell=${linkCellIdx}, nameHdr=${nameHeaderIdx}, offset=${offset}, adjCompany=${adjCompanyIdx}→"${out.company}", adjCity=${adjCityIdx}→"${out.city}", totalCells=${cells.length}`);
    }

    return out;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-SCROLL  +  LIVE DISCOVERY COUNTER
  // ═══════════════════════════════════════════════════════════════════════════
  setStatus("Scanning", "#eef2ff", "#4338ca");
  setPhase(1);

  const profileQueueMap  = new Map();
  const alreadyScrapedUrls = new Set();
  const searchPageData   = new Map();   // url → { company, city }

  if (savedCheckpoint) {
    savedCheckpoint.extractedData.slice(1).forEach((row) => {
      const url = row[row.length - 1].replace(/"/g, "");
      alreadyScrapedUrls.add(url);
    });
  }

  const colLayout = detectColumns();
  console.log("[BNI v15] Column layout detected:", colLayout);

  function captureLinks() {
    document.querySelectorAll("a").forEach((a) => {
      const href = a.href;
      if (!href || !href.includes("userId=") || href === window.location.href) return;
      if (profileQueueMap.has(href) || alreadyScrapedUrls.has(href)) return;

      let name = a.innerText.trim();
      if (!name || name.length > 120 || name.toLowerCase().includes("profile")) name = "Unknown";
      
      // If we already queued this URL but previously only saw an image link (so name was Unknown), update the name
      if (profileQueueMap.has(href)) {
        if (profileQueueMap.get(href).name === "Unknown" && name !== "Unknown") {
          profileQueueMap.get(href).name = name;
        }
        return;
      }
      
      profileQueueMap.set(href, { url: href, name });

      // Grab row-level company/city from the search page
      if (colLayout.companyIdx >= 0 || colLayout.cityIdx >= 0) {
        const rd = extractRowData(a, colLayout);
        if (rd.company || rd.city) searchPageData.set(href, rd);
      }
    });
    discoveredCount = profileQueueMap.size;
    updateDiscovery(discoveredCount);
  }

  // Initial capture
  captureLinks();

  // Scroll loop
  let prevScroll = 0, staleRounds = 0;
  while (staleRounds < 3 && !isStopped) {
    window.scrollBy(0, 800);
    document.querySelectorAll("div").forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 50 && !el.closest("#bni-panel")) el.scrollTop += 800;
    });

    await sleep(700);
    captureLinks();

    let snap = document.body.scrollHeight;
    document.querySelectorAll("div").forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 50 && !el.closest("#bni-panel")) snap += el.scrollTop;
    });
    if (snap === prevScroll) staleRounds++;
    else { staleRounds = 0; prevScroll = snap; }
  }

  // ── transition to scraping phase ───────────────────────────────────────────
  const profileQueue = Array.from(profileQueueMap.values());
  totalCount = profileQueue.length + (savedCheckpoint ? savedCheckpoint.extractedData.length - 1 : 0);

  hideDiscovery();
  setPhase(2);
  setStatus("Running", "#ecfdf5", "#059669");
  startTime = Date.now();   // reset for accurate ETA
  updateUI();

  if (profileQueue.length === 0) {
    setPhase(3);
    setStatus("Done", "#ecfdf5", "#059669");
    addLog("No new profiles to scrape", "ok");
    antiIdleActive = false;
    _timerWorker.terminate();
    if (scrapedCount > 0) downloadCSV();
    return;
  }

  addLog(`${profileQueue.length} profiles queued`, "ok");
  if (searchPageData.size > 0) addLog(`${searchPageData.size} company/city pre-captured`, "ok");

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE SCRAPER (iframe-based, with timeout protection)
  // ═══════════════════════════════════════════════════════════════════════════
  async function scrapeProfile(target, iframe) {
    addLog(target.name, "loading");
    try {
      iframe.src = target.url;
      
      // 1. Wait for initial iframe document load
      const initialLoaded = await Promise.race([
        new Promise((res) => { iframe.onload = () => res(true); }),
        sleep(IFRAME_TIMEOUT).then(() => false)
      ]);

      if (!initialLoaded) {
        addLog(target.name, "fail");
        failCount++;
        return { type: "timeout", target };
      }

      // 2. SMART POLLING: Wait for actual text content to render
      let doc = null;
      const pollStart = Date.now();
      const MAX_POLL = 10000;

      while (Date.now() - pollStart < MAX_POLL) {
        try {
          doc = iframe.contentDocument || iframe.contentWindow.document;
          if (doc) {
            const emailSvg = doc.querySelector('svg[aria-label="Email"]');
            const phoneSvg = doc.querySelector('svg[aria-label="Phone"]');
            
            // Check if the data values are actually present (not just the icons)
            const emailTxt = emailSvg?.parentElement?.nextElementSibling?.innerText?.trim();
            const phoneTxt = phoneSvg?.parentElement?.nextElementSibling?.innerText?.trim();
            
            if ((emailTxt && emailTxt.length > 3) || (phoneTxt && phoneTxt.length > 3)) {
              break; 
            }
          }
        } catch (e) {}
        await sleep(600);
      }
      
      // Safety settle time (v13 wait style)
      await sleep(1000);

      if (!doc) {
        try { doc = iframe.contentDocument || iframe.contentWindow.document; } catch(_) { return { type: "logout" }; }
      }

      if (!doc || doc.querySelector('input[type="password"]') || (doc.location && doc.location.href.toLowerCase().includes("login"))) {
        return { type: "logout" };
      }

      const pageText = doc.body?.innerText || "";
      const pageHtml = doc.body?.innerHTML || "";

      // ── Name ──
      const nameParts = target.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Unknown";
      const lastName  = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      // ── SVG-label extractor ──
      function bySvg(label) {
        const svgs = Array.from(doc.querySelectorAll(`svg[aria-label="${label}"]`));
        if (svgs.length === 0) return "N/A";
        
        let texts = [];
        for (const svg of svgs) {
          // The 'v13 way': parent -> next sibling
          let valEl = svg.parentElement?.nextElementSibling;
          let txt = valEl?.innerText?.trim();
          
          if (!txt || txt.length < 2) {
            // Fallback: look at the parent list item (v15 fallback)
            const li = svg.closest("li") || svg.closest(".MuiListItem-root");
            if (li) txt = li.innerText.trim();
          }
          
          if (txt && txt.toLowerCase() !== label.toLowerCase()) {
            txt = txt.replace(/[\r\n]+/g, " ");
            texts.push(txt);
          }
        }
        return texts.length ? [...new Set(texts)].join(" | ") : "N/A";
      }

      let company  = bySvg("Company");
      let website  = bySvg("Website");
      let address  = bySvg("Address");
      let phone    = bySvg("Phone");
      let email    = bySvg("Email");
      let category = bySvg("Industry");

      // ── City from profile page ──
      let city = "N/A";
      const pTags = Array.from(doc.querySelectorAll("p, span, div"));
      for (let j = 0; j < pTags.length; j++) {
        const t = pTags[j].innerText.trim();
        if ((t === "City" || t === "Location") && pTags[j + 1]) {
          city = pTags[j + 1].innerText.trim();
          break;
        }
      }

      // ── Fallback: search-page data for company & city ──
      const sp = searchPageData.get(target.url);
      if (sp) {
        if (company === "N/A" && sp.company) company = sp.company;
        if (city    === "N/A" && sp.city)    city    = sp.city;
      }

      // ── Email regex fallback (searches the whole page html) ──
      if (email === "N/A" || email === "") {
        const found = [...new Set(
          (pageHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
            .map((e) => e.toLowerCase())
        )].filter((e) => !/(w3\.org|sentry|example|webpack|localhost|bni\.com|bniconnect\.com)/i.test(e) && e.length < 50);
        if (found.length) email = found.join(" | ");
      }

      // ── Phone regex fallback (searches visible text) ──
      if (phone === "N/A" || phone === "") {
        // Broad regex to catch Indian formats (+91 9999999999) or standard formats.
        const matches = pageText.match(/(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}/g) || [];
        const foundPhone = [...new Set(matches.map(p => p.trim()))].filter(p => p.replace(/\D/g, '').length >= 8);
        if (foundPhone.length) phone = foundPhone.join(" | ");
      }

      const naCount = [company, email, phone, city].filter((v) => v === "N/A").length;
      if (naCount >= 3) { partialCount++; addLog(target.name, "warn"); }
      else              { okCount++;      addLog(target.name, "ok");   }

      return {
        type: "ok",
        row: [
          csvEscape(firstName), csvEscape(lastName),
          csvEscape(company),   csvEscape(category),
          csvEscape(email),     csvEscape(phone),
          csvEscape(city),      csvEscape(website),
          csvEscape(address),   csvEscape(target.url)
        ]
      };

    } catch (err) {
      addLog(target.name, "fail");
      failCount++;
      if (err.name === "SecurityError" || String(err).includes("cross-origin")) return { type: "logout" };
      return { type: "error", target };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL SCRAPING ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  const iframes = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const f = document.createElement("iframe");
    Object.assign(f.style, { width: "1px", height: "1px", opacity: "0", position: "absolute", top: "-9999px", pointerEvents: "none" });
    document.body.appendChild(f);
    iframes.push(f);
  }

  let queueIndex = 0;
  let checkpointCounter = 0;

  async function workerLoop(iframe) {
    while (!isStopped && !loggedOut) {
      // honour pause
      while (isPaused && !isStopped) await sleep(500);

      // grab next index atomically (before any await)
      const myIdx = queueIndex++;
      if (myIdx >= profileQueue.length) break;

      const target = profileQueue[myIdx];
      const result = await scrapeProfile(target, iframe);

      if (result.type === "logout") { loggedOut = true; break; }

      if (result.type === "ok") {
        extractedData.push(result.row);
        scrapedCount++;
        checkpointCounter++;
        if (checkpointCounter >= CHECKPOINT_EVERY) { saveCheckpoint(); checkpointCounter = 0; }
      } else if (result.type === "timeout" || result.type === "error") {
        if (!target._retries) target._retries = 0;
        if (target._retries < MAX_RETRIES) { target._retries++; retryQueue.push(target); }
      }

      updateUI();
      await sleep(600 + Math.random() * 400); // 600-1000 ms jitter to stay under the radar
    }
  }

  // launch workers in parallel
  await Promise.all(iframes.map((f) => workerLoop(f)));

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY QUEUE
  // ═══════════════════════════════════════════════════════════════════════════
  if (retryQueue.length > 0 && !isStopped && !loggedOut) {
    addLog(`Retrying ${retryQueue.length} failed…`, "loading");
    for (const target of retryQueue) {
      if (isStopped || loggedOut) break;
      while (isPaused && !isStopped) await sleep(500);

      const result = await scrapeProfile(target, iframes[0]);
      if (result.type === "logout") { loggedOut = true; break; }
      if (result.type === "ok") {
        extractedData.push(result.row);
        scrapedCount++;
        failCount = Math.max(0, failCount - 1);  // correct the count
      }
      updateUI();
      await sleep(1200);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════
  iframes.forEach((f) => { try { document.body.removeChild(f); } catch (_) {} });
  antiIdleActive = false;
  if (wakeLock) try { wakeLock.release(); } catch (_) {}

  if (loggedOut) {
    setStatus("Logged Out", "#fef2f2", "#dc2626");
    saveCheckpoint();
    alert(`[BNI Scraper v15] Session ended (logged out). ${scrapedCount} contacts saved.\nReload the page and run again to resume!`);
  } else {
    setPhase(3);
    setStatus("Complete!", "#ecfdf5", "#059669");
    localStorage.removeItem(CHECKPOINT_KEY);
    // NOTE: intentionally NOT saving a checkpoint after removal (v14 bug fix)
  }

  updateUI();
  if (scrapedCount > 0) downloadCSV();

  _timerWorker.terminate();
  console.log(`%c⚡ BNI Scraper v15 complete — ${scrapedCount} contacts exported.`, "color:#6366f1;font-size:16px;font-weight:bold;");

})();

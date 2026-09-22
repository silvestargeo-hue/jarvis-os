/* ============================================================
   JARVIS OS — AI Code Studio (code.js)
   Write HTML/CSS/JS, run it in a sandboxed iframe preview,
   ask keyless AI to build or explain code, download output.
   ============================================================ */

"use strict";

const AppCode = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <button class="app-btn" id="code-run">▶ Run</button>
        <button class="app-btn ghost" id="code-ai">✨ AI build</button>
        <button class="app-btn ghost" id="code-explain">🧠 AI explain</button>
        <select class="app-select" id="code-tpl">
          <option value="">Templates…</option>
          <option value="landing">Landing page</option>
          <option value="canvas">Canvas animation</option>
          <option value="game">Mini game</option>
        </select>
        <button class="app-btn ghost" id="code-dl">⬇</button>
      </div>
      <textarea class="app-textarea" id="code-ed" spellcheck="false" style="min-height:150px;font-family:var(--font-mono);font-size:13px;background:rgba(2,8,18,.9);color:#d7f6ff"></textarea>
      <div class="app-toolbar" style="margin-top:8px">
        <span class="diag" id="code-status">Ready.</span>
      </div>
      <iframe id="code-preview" sandbox="allow-scripts" style="width:100%;height:230px;border:1px solid rgba(56,189,248,.25);border-radius:10px;background:#02060f"></iframe>`;

    const win = OS.makeWin({ id: "code", title: "AI CODE STUDIO", icon: "💻", body: root, w: 720, h: 640 });
    const ed = win.body.querySelector("#code-ed");
    const prev = win.body.querySelector("#code-preview");
    const status = win.body.querySelector("#code-status");

    ed.value = OS.get("code-src", `<!DOCTYPE html>\n<html>\n<body style="background:#030711;color:#67e8f9;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">\n  <h1>Hello from JARVIS Code Studio</h1>\n</body>\n</html>`);
    ed.addEventListener("input", () => OS.set("code-src", ed.value));

    const run = () => {
      prev.srcdoc = ed.value;
      status.textContent = "Ran at " + new Date().toLocaleTimeString();
      Achievements.flag("code-runs");
    };
    win.body.querySelector("#code-run").onclick = run;

    win.body.querySelector("#code-dl").onclick = () => {
      const blob = new Blob([ed.value], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "jarvis-app.html";
      a.click();
      OS.toast("Downloaded jarvis-app.html", "ok");
    };

    win.body.querySelector("#code-tpl").onchange = (e) => {
      const t = e.target.value;
      if (!t) return;
      const tpl = {
        landing: `<!DOCTYPE html>\n<html>\n<head><style>\n  body{margin:0;font-family:sans-serif;background:linear-gradient(160deg,#030711,#0a1428);color:#e8f4ff;display:grid;place-items:center;height:100vh}\n  h1{font-size:3em;background:linear-gradient(90deg,#22d3ee,#8b5cf6);-webkit-background-clip:text;color:transparent}\n  button{padding:12px 28px;font-size:1em;border:none;border-radius:9px;background:#22d3ee;cursor:pointer}\n</style></head>\n<body>\n  <div style="text-align:center">\n    <h1>NEON STARTUP</h1>\n    <p>The future is now.</p>\n    <button onclick="alert('Welcome!')">Get Started</button>\n  </div>\n</body>\n</html>`,
        canvas: `<!DOCTYPE html>\n<html>\n<body style="margin:0;background:#02060f;overflow:hidden">\n<canvas id="c"></canvas>\n<script>\nconst c=document.getElementById('c'),x=c.getContext('2d');\nc.width=innerWidth;c.height=innerHeight;\nlet t=0;\n(function f(){\n  x.fillStyle='rgba(2,6,15,.08)';x.fillRect(0,0,c.width,c.height);\n  for(let i=0;i<5;i++){\n    const a=t*(0.02+i*0.01)+i;\n    x.beginPath();\n    x.strokeStyle='hsla('+(180+i*30)+',90%,60%,.6)';\n    x.arc(c.width/2,c.height/2,60+i*28+Math.sin(t*.05)*18,a,a+2.6);\n    x.stroke();\n  }\n  t++;requestAnimationFrame(f);\n})();\n<\/script>\n</body>\n</html>`,
        game: `<!DOCTYPE html>\n<html>\n<body style="margin:0;background:#030711;color:#67e8f9;font-family:monospace;display:grid;place-items:center;height:100vh">\n<div style="text-align:center">\n<h2>🎯 CATCH THE DOT</h2>\n<div id="s">Score: 0</div>\n<button id="b" style="width:70px;height:70px;border-radius:50%;border:2px solid #22d3ee;background:#0a1428;color:#67e8f9;font-size:1.4em;cursor:pointer">●</button>\n<p>Click the dot before it moves!</p>\n</div>\n<script>\nlet sc=0;const b=document.getElementById('b'),s=document.getElementById('s');\nb.onmouseenter=()=>{b.style.transform='translate('+((Math.random()*200)-100)+'px,'+((Math.random()*100)-50)+'px)'};\nb.onclick=()=>{sc++;s.textContent='Score: '+sc;b.style.transform='none';SFX&&0};\n<\/script>\n</body>\n</html>`,
      }[t];
      if (tpl) { ed.value = tpl; OS.set("code-src", tpl); run(); }
      e.target.value = "";
    };

    win.body.querySelector("#code-ai").onclick = async () => {
      const want = prompt("Describe the app you want JARVIS to build:\n(e.g. 'a pomodoro timer with ring animation')");
      if (!want) return;
      status.textContent = "JARVIS is building…";
      const sys = "You are JARVIS, an expert web engineer. Output ONE complete self-contained HTML file with inline CSS and JS. No explanations, no markdown fences — raw HTML only.";
      status.textContent = "Generating…";
      let out = "";
      await AICore.chat([{ role: "system", content: sys }, { role: "user", content: want }], {
        onToken: (t) => { out += t; status.textContent = "Generating… " + out.length + " chars"; },
        onDone: () => {
          let html = out.trim();
          html = html.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "");
          if (!/<html/i.test(html)) html = `<!DOCTYPE html>\n<html><body style="font-family:sans-serif;background:#030711;color:#e8f4ff;padding:20px">\n<h2>JARVIS output</h2>\n<pre style="white-space:pre-wrap">${html.replace(/</g, "&lt;")}</pre></body></html>`;
          ed.value = html;
          OS.set("code-src", html);
          run();
          OS.toast("Built! Check the preview", "ok");
        },
        onError: (m) => { status.textContent = m; },
      });
    };

    win.body.querySelector("#code-explain").onclick = async () => {
      if (!ed.value.trim()) return;
      if (!OS.wins.get("chat")) OS.launchApp("chat"); // bubble target must exist
      status.textContent = "JARVIS is reading your code…";
      const a = await AICore.complete(
        "Explain this code in max 5 bullet points:\n\n" + ed.value.slice(0, 6000),
        "You are JARVIS. Answer in at most 5 concise bullet points."
      );
      status.textContent = "";
      OS.toast(a ? "Explanation ready — check chat log" : "AI unavailable", a ? "ok" : "err");
      if (a) {
        OS.launchApp("chat");
        setTimeout(() => {
          AppChat.bubble(document.querySelector("#chat-log")?.closest(".win"), "ai", "🧠 Code explanation:\n" + a);
        }, 400);
        const h = OS.get("chat-history", []);
        h.push({ role: "assistant", content: "🧠 Code explanation:\n" + a });
        OS.set("chat-history", h);
      }
    };

    setTimeout(run, 250);
    return win;
  },
};

/* JARVIS OS — boot registry (loaded deferred, after all app scripts) */
"use strict";

window.JARVIS_APPS = [
  { id: "chat",     name: "AI Chat",     icon: "🤖", hint: "Keyless streaming AI · vision · voice", launch: function(){ return AppChat.launch(); } },
  { id: "library",  name: "Library",     icon: "📚", hint: "RAG memory — your docs, cited answers", launch: function(){ return AppLibrary.launch(); } },
  { id: "mesh",     name: "Mesh",        icon: "🛡", hint: "E2EE encrypted mesh chat",              launch: function(){ return AppMesh.launch(); } },
  { id: "image",    name: "Image Lab",   icon: "🎨", hint: "Keyless text-to-image generation",       launch: function(){ return AppImage.launch(); } },
  { id: "terminal", name: "Terminal",    icon: "⌨️", hint: "jarvis shell — 30+ real commands",       launch: function(){ return AppTerminal.launch(); } },
  { id: "notes",    name: "Notes",       icon: "📝", hint: "Persistent notes",                        launch: function(){ return AppNotes.launch(); } },
  { id: "tasks",    name: "Tasks",       icon: "✅", hint: "Persistent task board",                   launch: function(){ return AppTasks.launch(); } },
  { id: "files",    name: "Files",       icon: "🗂", hint: "Documents, images, audio you made",      launch: function(){ return AppFiles.launch(); } },
  { id: "code",     name: "Code Studio", icon: "💻", hint: "AI builds apps — live preview",          launch: function(){ return AppCode.launch(); } },
  { id: "achievements", name: "Awards",  icon: "🏆", hint: "Achievements gallery",                   launch: function(){ return Achievements.launch(); } },
  { id: "marketplace", name: "Themes",   icon: "🎭", hint: "Theme marketplace — presets & sharing",   launch: function(){ return AppMarketplace.launch(); } },
  { id: "about",    name: "System",      icon: "🛰", hint: "About JARVIS OS + diagnostics",          launch: function(){ return AppAbout.launch(); } },
  { id: "settings", name: "Settings",    icon: "⚙️", hint: "Language, theme, voice, PIN, backup",    launch: function(){ return AppSettings.launch(); } }
];

// Register palette commands for each app
window.JARVIS_APPS.forEach(function (app) {
  OS.registerCommand({ name: "Open " + app.name, icon: app.icon, hint: app.hint, keywords: app.name + " app open", run: function () { OS.launchApp(app.id); } });
});

OS.buildDock();
OS.boot();

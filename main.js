const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
let robot;
try { robot = require('robotjs'); } catch(e) {
  try { const { mouse, keyboard, Point } = require('@nut-tree-fork/nut-js'); robot = { moveMouse: async (x,y) => { await mouse.setPosition(new Point(x,y)); }, mouseClick: async () => { await mouse.leftClick(); }, typeString: async (s) => { await keyboard.type(s); }, keyTap: async (k) => { await keyboard.pressKey(k); } }; } catch(e2) { robot = null; }
}
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1100, height: 750, webPreferences: { nodeIntegration: true, contextIsolation: false }, title: 'VOBIX REMOTE - TeamViewer Gratis $0 P2P' });
  mainWindow.loadFile('index-remote.html');
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => { desktopCapturer.getSources({ types: ['screen','window'] }).then((sources) => { callback({ video: sources[0] }); }); });
}
app.whenReady().then(createWindow);
ipcMain.on('remote-control', async (event, data) => {
  if (!robot) return;
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    if (data.type === 'mouse') {
      const x = Math.floor(data.x * width); const y = Math.floor(data.y * height);
      if (data.action === 'move' || data.action === 'click') {
        if (robot.moveMouse) robot.moveMouse(x,y); else await robot.moveMouse(x,y);
        if (data.action === 'click') { setTimeout(()=>{ if(robot.mouseClick) robot.mouseClick(); },50); }
      } else if (data.action === 'scroll') { if(robot.scrollMouse) robot.scrollMouse(0,data.deltaY||0); }
    } else if (data.type === 'key') {
      if (data.action === 'down') { const k=data.key; if(k.length===1){ if(robot.typeString) robot.typeString(k); else await robot.typeString(k);} else { if(robot.keyTap) robot.keyTap(k); } }
      else if (data.action === 'ctrlaltsupr') { if(robot.keyTap) robot.keyTap('delete',['control','alt']); }
    }
  } catch(e){ console.error(e); }
});
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

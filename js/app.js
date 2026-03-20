// ============================================
// Artale RJPQ 跳平台輔助 - OOP 重構版 (Clean Code)
// ============================================

// === 常數定義 (Magic Numbers Elimination) ===
const CONFIG = {
  MAP_LAYERS: 10,
  MAP_PLATFORMS: 4,
  TEAM_COLORS: {
    red:    { name: '紅', hex: '#ef4444' },
    blue:   { name: '藍', hex: '#3b82f6' },
    green:  { name: '綠', hex: '#10b981' },
    yellow: { name: '黃', hex: '#f59e0b' }
  }
};

// === 輕量級 Toast 通知系統 ===
class Toast {
  static show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(msg);

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warn') icon = '⚠️';

    toast.innerText = `${icon} ${msg}`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
  }

  static info(msg, d) { this.show(msg, 'info', d); }
  static success(msg, d) { this.show(msg, 'success', d); }
  static warn(msg, d) { this.show(msg, 'warn', d); }
  static error(msg, d) { this.show(msg, 'error', d); }
}

// === 全域狀態管理器 (State Encapsulation) ===
class AppState {
  constructor() {
    this.myNick = '';
    this.myColor = null;
    this.isHost = false;
    this.fullMyId = '';
    this.connections = {}; // { peerId: { conn, nick, color } }
    this.colorMap = {};    // { nick: color }
    this.peer = null;
    
    // 初始化地圖資料
    this.mapData = Array(CONFIG.MAP_LAYERS).fill(null).map(() =>
      Array(CONFIG.MAP_PLATFORMS).fill(null).map(() => ({ v: 0, owner: null, color: null }))
    );
  }
  
  forEachPlatform(callback) {
    for (let floorIndex = 0; floorIndex < CONFIG.MAP_LAYERS; floorIndex++) {
      for (let platformIndex = 0; platformIndex < CONFIG.MAP_PLATFORMS; platformIndex++) {
        callback(floorIndex, platformIndex, this.mapData[floorIndex][platformIndex]);
      }
    }
  }
}

// === DOM 管理器 ===
class UIManager {
  constructor() {
    this.els = {
      load:        document.getElementById('loading'),
      loadMsg:     document.getElementById('load-msg'),
      joinInput:   document.getElementById('join-id'),
      grid:        document.getElementById('map-grid'),
      btnHost:     document.getElementById('btn-host'),
      btnJoin:     document.getElementById('btn-join'),
      memberList:  document.getElementById('member-list'),
      btnReset:    document.getElementById('btn-reset-all'),
      btnReload:   document.getElementById('btn-reload'),
      nickInput:   document.getElementById('nick-input'),
      btnSaveNick: document.getElementById('btn-save-nick'),
      btnEditNick: document.getElementById('btn-edit-nick'),
      initActions: document.getElementById('init-actions'),
      joinRow:     document.getElementById('join-row'),
      connPanel:   document.getElementById('conn-panel'),
      connActions: document.getElementById('connected-actions'),
      colorSel:    document.getElementById('color-selector'),
      colorWarn:   document.getElementById('color-warning'),
      helpModal:   document.getElementById('help-modal'),
      btnOpenHelp: document.getElementById('btn-open-help'),
      btnCloseHelp:document.getElementById('btn-close-help'),
      setSummary:  document.getElementById('settings-summary'),
      setContent:  document.getElementById('settings-content'),
      summaryInfo: document.getElementById('summary-info'),
      btnCopy:     document.getElementById('btn-copy'),
      btnLeave:    document.getElementById('btn-leave'),
      colorCircles: document.querySelectorAll('.color-circle')
    };

    this.isSettingsCollapsed = false;
  }

  setLoading(show, msg = '處理中...') {
    if (show) {
      this.els.load.classList.remove('is-hidden');
      this.els.load.style.display = 'flex'; // Force flex display for overlay
      this.els.loadMsg.innerText = msg;
    } else {
      this.els.load.classList.add('is-hidden');
      this.els.load.style.display = 'none';
    }
  }

  toggleSettings() {
    this.isSettingsCollapsed = !this.isSettingsCollapsed;
    if (this.isSettingsCollapsed) {
      this.els.setContent.classList.add('is-hidden');
      this.els.setSummary.classList.add('visible');
    } else {
      this.els.setContent.classList.remove('is-hidden');
      this.els.setSummary.classList.remove('visible');
    }
  }
  
  autoCollapseOnConnect() {
    this.isSettingsCollapsed = true;
    this.els.setContent.classList.add('is-hidden');
    this.els.setSummary.classList.add('visible');
  }
  
  resetSettingsCollapse() {
    this.isSettingsCollapsed = false;
    this.els.setContent.classList.remove('is-hidden');
    this.els.setSummary.classList.remove('visible');
  }

  updateSummaryUI(state) {
    if (!state.fullMyId && Object.keys(state.connections).length === 0) return;
    
    const roomText = state.fullMyId ? `房號: ${state.fullMyId.substring(0, 4)}...` : `已加入房間`;
    const colorKey = state.myColor ? state.myColor : 'no-color';
    const colorName = state.myColor ? CONFIG.TEAM_COLORS[state.myColor].name : '未選色';
    
    this.els.summaryInfo.innerHTML = `
      <strong>${roomText}</strong> | 
      <span class="summary-color-dot" style="background-color: var(--color-${colorKey});"></span>
      ${state.myNick} (${colorName})
    `;
  }

  resetColorButtons(state) {
    this.els.colorCircles.forEach(btn => {
      btn.classList.remove('selected', 'taken');
    });

    Object.entries(state.colorMap).forEach(([nick, color]) => {
      if (nick !== state.myNick) {
        const btn = document.querySelector(`.color-circle.${color}`);
        if (btn) btn.classList.add('taken');
      }
    });

    if (state.myColor) {
      const btn = document.querySelector(`.color-circle.${state.myColor}`);
      if (btn) btn.classList.add('selected');
    }
  }

  renderMemberTags(tags) {
    this.els.memberList.innerHTML = '';
    tags.forEach(t => {
      const pill = document.createElement('span');
      const colorClass = t.color ? `color-${t.color}` : 'no-color';
      pill.className = `member-pill ${colorClass}`;
      pill.innerText = `${t.nick} ${t.isHost ? '(房)' : ''}`;
      this.els.memberList.appendChild(pill);
    });
  }

  updatePlatformAppearance(floorIndex, platformIndex, item) {
    const el = document.getElementById(`p-${floorIndex}-${platformIndex}`);
    if (!el) return;

    el.classList.remove('marked-red', 'marked-blue', 'marked-green', 'marked-yellow', 'dead');
    
    if (item.v === 1 && item.color) {
      el.classList.add(`marked-${item.color}`);
      el.innerText = item.owner || '';
    } else {
      el.innerText = '';
    }
  }
  
  toggleDeadMark(floorIndex, platformIndex) {
    const el = document.getElementById(`p-${floorIndex}-${platformIndex}`);
    if (!el) return;
    if (el.classList.contains('dead')) {
      el.classList.remove('dead');
      el.innerText = '';
    } else {
      if (el.className.includes('marked-')) return;
      el.classList.add('dead');
      el.innerText = '✕';
    }
  }
}

// === 地圖控制器 (SRP: 專注於地圖邏輯) ===
class MapController {
  constructor(state, ui, roomManager) {
    this.state = state;
    this.ui = ui;
    this.rm = roomManager; // Reference to RoomManager for syncing
  }

  renderGrid() {
    this.ui.els.grid.innerHTML = '';
    for (let floorIndex = 0; floorIndex < CONFIG.MAP_LAYERS; floorIndex++) {
      const floor = document.createElement('div');
      floor.className = 'map-floor';

      const label = document.createElement('div');
      label.className = 'floor-label';
      label.innerText = `L${CONFIG.MAP_LAYERS - floorIndex}`;
      floor.appendChild(label);

      const platforms = document.createElement('div');
      platforms.className = 'grid-container';

      for (let platformIndex = 0; platformIndex < CONFIG.MAP_PLATFORMS; platformIndex++) {
        const btn = document.createElement('button');
        btn.className = 'platform-btn';
        btn.id = `p-${floorIndex}-${platformIndex}`;
        btn.innerHTML = '';

        let lastTouchTime = 0;
        btn.addEventListener('touchstart', (e) => {
          const now = Date.now();
          if (now - lastTouchTime < 350) {
            e.preventDefault();
            this.handleRightClick(floorIndex, platformIndex);
          }
          lastTouchTime = now;
        }, { passive: false });

        btn.addEventListener('click', () => this.validateAndProcessClick(floorIndex, platformIndex));
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.handleRightClick(floorIndex, platformIndex);
        });

        platforms.appendChild(btn);
      }
      floor.appendChild(platforms);
      this.ui.els.grid.appendChild(floor);
    }
  }

  validateAndProcessClick(floorIndex, platformIndex) {
    if (!this.state.myNick) return Toast.error('需先設定角色名稱！');
    if (!this.state.myColor) {
      this.ui.els.colorWarn.classList.remove('is-hidden');
      setTimeout(() => this.ui.els.colorWarn.classList.add('is-hidden'), 3000);
      return;
    }

    const item = this.state.mapData[floorIndex][platformIndex];
    
    if (item.v === 1) {
      if (item.owner === this.state.myNick || this.state.isHost) {
        this.updateMapData(floorIndex, platformIndex, 0, null, null);
      } else {
        return Toast.warn(`無法覆蓋 ${item.owner} 的位置。`);
      }
    } else {
      if (item.owner && item.owner !== this.state.myNick) return;
      
      // Clear own marks on the same floor
      for (let i = 0; i < CONFIG.MAP_PLATFORMS; i++) {
        if (this.state.mapData[floorIndex][i].owner === this.state.myNick) {
          this.updateMapData(floorIndex, i, 0, null, null);
        }
      }
      this.updateMapData(floorIndex, platformIndex, 1, this.state.myNick, this.state.myColor);
    }
  }

  updateMapData(floorIndex, platformIndex, v, owner, color) {
    this.state.mapData[floorIndex][platformIndex] = { v, owner, color };
    this.ui.updatePlatformAppearance(floorIndex, platformIndex, this.state.mapData[floorIndex][platformIndex]);
    this.rm.syncMsg({ type: 'SYNC', f: floorIndex, d: platformIndex, v, owner, color });
  }

  handleRightClick(floorIndex, platformIndex) {
    this.ui.toggleDeadMark(floorIndex, platformIndex);
  }

  clearLocal() {
    this.state.forEachPlatform((f, p, item) => {
      item.v = 0; item.owner = null; item.color = null;
      this.ui.updatePlatformAppearance(f, p, item);
      const el = document.getElementById(`p-${f}-${p}`);
      if (el) el.classList.remove('dead');
    });
  }

  resetAll() {
    if (!this.state.isHost) return;
    this.clearLocal();
    this.rm.broadcast({ type: 'RESET' });
    Toast.success('已清空地圖標記');
  }

  removeUserMarkers(nick) {
    this.state.forEachPlatform((f, p, item) => {
      if (item.owner === nick) {
        item.v = 0; item.owner = null; item.color = null;
        this.ui.updatePlatformAppearance(f, p, item);
      }
    });
  }
}

// === 房間與網路管理器 ===
class RoomManager {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.mapCtrl = null; // injected later
  }

  setMapController(mc) {
    this.mapCtrl = mc;
  }

  initPeer(onReady) {
    if (this.state.peer) return onReady();
    this.ui.setLoading(true, '建立 P2P 網關...');

    this.state.peer = new Peer({
      debug: 1,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      }
    });

    this.state.peer.on('open', (id) => {
      this.state.fullMyId = id;
      Toast.success(`連線就緒 (ID: ${id.substring(0, 4)}...)`);
      this.ui.setLoading(false);
      onReady();
    });

    this.state.peer.on('connection', (conn) => this.setupConnection(conn));
    this.state.peer.on('error', (err) => {
      this.ui.setLoading(false);
      Toast.error(`連線錯誤: ${err.type}`);
    });
  }

  startHost() {
    this.initPeer(() => {
      this.state.isHost = true;
      if (this.state.myColor) this.state.colorMap[this.state.myNick] = this.state.myColor;
      
      this.ui.els.connPanel.classList.add('is-hidden');
      this.ui.els.connActions.classList.remove('is-hidden');
      this.ui.els.btnReset.classList.remove('is-hidden');
      
      window.location.hash = this.state.fullMyId;
      Toast.success('房間已建立 (你為房長)');
      
      this.refreshMemberList();
      this.ui.autoCollapseOnConnect();
      this.ui.updateSummaryUI(this.state);
    });
  }

  startJoin(targetId) {
    if (!targetId) return Toast.error('請貼上房號！');
    this.initPeer(() => {
      this.ui.setLoading(true, '正在加入...');
      const conn = this.state.peer.connect(targetId, { reliable: true });
      this.setupConnection(conn);
      
      conn.on('open', () => {
        conn.send({ type: 'JOIN', nick: this.state.myNick, color: this.state.myColor });
      });
      
      setTimeout(() => {
        if (!this.ui.els.load.classList.contains('is-hidden') && Object.keys(this.state.connections).length === 0) {
          this.ui.setLoading(false);
          Toast.error('連線超時，請確認房號。');
        }
      }, 8000);
    });
  }

  setupConnection(conn) {
    conn.on('data', (data) => this.handleP2PMessage(conn, data));
    conn.on('close', () => {
      const user = this.state.connections[conn.peer];
      if (user) {
        Toast.warn(`${user.nick} 離開了。`);
        this.mapCtrl.removeUserMarkers(user.nick);
        if (user.color) delete this.state.colorMap[user.nick];
        delete this.state.connections[conn.peer];
        
        this.refreshMemberList();
        this.ui.resetColorButtons(this.state);
        
        if (this.state.isHost) {
          this.broadcast({ type: 'NICK_LIST', users: this.getFullNickList() });
          this.broadcast({ type: 'COLOR_MAP', colorMap: { ...this.state.colorMap } });
        }
      }
    });
    conn.on('error', (err) => console.error(`P2P 錯誤: ${err}`));
  }

  handleP2PMessage(conn, data) {
    switch (data.type) {
      case 'JOIN': this.handleJoin(conn, data); break;
      case 'WELCOME': this.handleWelcome(conn, data); break;
      case 'NICK_LIST': this.ui.renderMemberTags(data.users); break;
      case 'COLOR_SELECT': this.handleColorSelect(conn, data); break;
      case 'COLOR_MAP': this.handleColorMap(data); break;
      case 'REJECT':
        this.ui.setLoading(false);
        Toast.error(data.reason);
        conn.close();
        break;
      case 'SYNC': this.handleSync(data, conn); break;
      case 'RESET':
        this.mapCtrl.clearLocal();
        if (this.state.isHost) this.broadcast(data, conn);
        break;
    }
  }

  handleJoin(conn, data) {
    if (!this.state.isHost) return;
    const isDup = Object.values(this.state.connections).some(v => v.nick === data.nick) || this.state.myNick === data.nick;
    if (isDup) {
      conn.send({ type: 'REJECT', reason: `暱稱「${data.nick}」已有人使用` });
      setTimeout(() => conn.close(), 500);
      return;
    }

    if (data.color) {
      if (this.state.colorMap[this.state.myNick] === data.color || Object.entries(this.state.colorMap).find(([n, c]) => c === data.color)) {
        data.color = null; // Conflict
      }
    }

    this.state.connections[conn.peer] = { conn, nick: data.nick, color: data.color };
    if (data.color) this.state.colorMap[data.nick] = data.color;
    Toast.success(`加入: ${data.nick}`);

    const fullList = this.getFullNickList();
    this.broadcast({ type: 'NICK_LIST', users: fullList });
    this.broadcast({ type: 'COLOR_MAP', colorMap: { ...this.state.colorMap } });

    conn.send({
      type: 'WELCOME',
      state: this.state.mapData,
      users: fullList,
      colorMap: { ...this.state.colorMap }
    });
    
    this.refreshMemberList();
    this.ui.resetColorButtons(this.state);
  }

  handleWelcome(conn, data) {
    this.ui.setLoading(false);
    this.state.isHost = false;
    this.state.connections[conn.peer] = { conn, nick: '房主' };

    this.state.mapData = JSON.parse(JSON.stringify(data.state));
    if (data.colorMap) {
      this.state.colorMap = { ...data.colorMap };
      if (this.state.myColor) this.state.colorMap[this.state.myNick] = this.state.myColor;
      this.ui.resetColorButtons(this.state);
    }

    this.state.forEachPlatform((f, p) => this.ui.updatePlatformAppearance(f, p, this.state.mapData[f][p]));

    Toast.success('加入房間成功！');
    this.ui.els.connPanel.classList.add('is-hidden');
    this.ui.els.connActions.classList.remove('is-hidden');
    this.ui.els.joinInput.value = '';
    
    history.replaceState(null, document.title, window.location.pathname);
    this.ui.renderMemberTags(data.users);
    this.ui.autoCollapseOnConnect();
    this.ui.updateSummaryUI(this.state);
  }

  handleColorSelect(conn, data) {
    if (!this.state.isHost) return;
    if (data.color) {
      const taken = Object.entries(this.state.colorMap).find(([n, c]) => c === data.color && n !== data.nick);
      if (taken) {
        conn.send({ type: 'COLOR_MAP', colorMap: { ...this.state.colorMap } });
        return;
      }
      this.state.colorMap[data.nick] = data.color;
    } else {
      delete this.state.colorMap[data.nick];
    }

    const connInfo = Object.values(this.state.connections).find(c => c.nick === data.nick);
    if (connInfo) connInfo.color = data.color;

    this.broadcast({ type: 'COLOR_MAP', colorMap: { ...this.state.colorMap } });
    this.refreshMemberList();
    this.ui.resetColorButtons(this.state);
  }

  handleColorMap(data) {
    this.state.colorMap = { ...data.colorMap };
    if (this.state.myColor && this.state.colorMap[this.state.myNick] !== this.state.myColor) {
      if (!this.state.colorMap[this.state.myNick]) {
        this.state.colorMap[this.state.myNick] = this.state.myColor;
      }
    }
    this.ui.resetColorButtons(this.state);
    this.refreshMemberList();
  }

  handleSync(data, conn) {
    this.state.mapData[data.f][data.d].v = data.v;
    this.state.mapData[data.f][data.d].owner = data.owner;
    this.state.mapData[data.f][data.d].color = data.color;

    if (data.v === 1) {
      for (let i = 0; i < CONFIG.MAP_PLATFORMS; i++) {
        if (i !== data.d && this.state.mapData[data.f][i].owner === data.owner) {
          this.state.mapData[data.f][i].v = 0;
          this.state.mapData[data.f][i].owner = null;
          this.state.mapData[data.f][i].color = null;
          this.ui.updatePlatformAppearance(data.f, i, this.state.mapData[data.f][i]);
        }
      }
    }
    this.ui.updatePlatformAppearance(data.f, data.d, this.state.mapData[data.f][data.d]);
    if (this.state.isHost) this.broadcast(data, conn);
  }

  getFullNickList() {
    const list = [{ nick: this.state.myNick, isHost: true, color: this.state.myColor }];
    Object.values(this.state.connections).forEach(c => {
      list.push({ nick: c.nick, isHost: false, color: c.color || this.state.colorMap[c.nick] || null });
    });
    return list;
  }

  broadcast(msg, exclude = null) {
    Object.values(this.state.connections).forEach(c => {
      if (c.conn.open && c.conn !== exclude) c.conn.send(msg);
    });
  }

  syncMsg(msg) {
    if (this.state.isHost) {
      this.broadcast(msg);
    } else {
      const hostConn = Object.values(this.state.connections).find(c => c.nick === '房主');
      if (hostConn && hostConn.conn.open) hostConn.conn.send(msg);
    }
  }

  refreshMemberList() {
    this.ui.renderMemberTags(this.getFullNickList().filter(t => {
      if (t.isHost) return true;
      const connMatched = Object.values(this.state.connections).find(c => c.nick === t.nick);
      return connMatched && connMatched.conn && connMatched.conn.open;
    }));
  }

  leaveRoom() {
    if (this.state.peer) { 
      this.state.peer.destroy(); 
      this.state.peer = null; 
    }
    this.state.isHost = false; 
    this.state.fullMyId = ''; 
    this.state.connections = {};
    
    this.state.colorMap = {}; 
    if (this.state.myColor) this.state.colorMap[this.state.myNick] = this.state.myColor;
    
    this.mapCtrl.clearLocal();

    this.ui.els.initActions.classList.remove('is-hidden');
    this.ui.els.connPanel.classList.remove('is-hidden');
    this.ui.els.connActions.classList.add('is-hidden');
    this.ui.els.btnReset.classList.add('is-hidden');
    this.ui.els.memberList.innerHTML = '';
    
    this.ui.resetColorButtons(this.state);
    this.ui.resetSettingsCollapse();
    Toast.warn('已離開房間。');
  }

  copyInvite() {
    const url = window.location.origin + window.location.pathname + '#' + this.state.fullMyId;
    navigator.clipboard.writeText(url).then(() => {
      Toast.success('邀請連結已複製！');
    }).catch(() => prompt('請手動複製：', url));
  }
}

// === 主程式邏輯 (Application Bootstrap) ===
document.addEventListener('DOMContentLoaded', () => {
  const state = new AppState();
  const ui = new UIManager();
  const rm = new RoomManager(state, ui);
  const mapCtrl = new MapController(state, ui, rm);
  rm.setMapController(mapCtrl);

  // 初始化地圖
  mapCtrl.renderGrid();

  // 綁定 DOM 事件
  ui.els.btnOpenHelp.addEventListener('click', () => ui.els.helpModal.classList.add('visible'));
  ui.els.btnCloseHelp.addEventListener('click', () => ui.els.helpModal.classList.remove('visible'));
  ui.els.helpModal.addEventListener('click', (e) => {
    if (e.target === ui.els.helpModal) ui.els.helpModal.classList.remove('visible');
  });

  ui.els.setSummary.addEventListener('click', () => ui.toggleSettings());

  ui.els.btnSaveNick.addEventListener('click', () => {
    let val = ui.els.nickInput.value.trim();
    if (val === '') val = '玩家' + Math.floor(1000 + Math.random() * 9000);
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5]{1,10}$/.test(val)) return Toast.error('暱稱請使用 1-10 位英數或中文字。');

    state.myNick = val;
    ui.els.nickInput.value = state.myNick;
    ui.els.nickInput.disabled = true;
    ui.els.btnSaveNick.classList.add('is-hidden');
    ui.els.btnEditNick.classList.remove('is-hidden');

    ui.els.colorSel.classList.remove('is-hidden');
    ui.els.initActions.classList.remove('is-hidden');

    Toast.success(`暱稱儲存: ${state.myNick}`);
    rm.refreshMemberList();
  });

  ui.els.btnEditNick.addEventListener('click', () => {
    if (!confirm('修改角色將斷開房間連線，確定嗎？')) return;
    rm.leaveRoom();
    
    ui.els.nickInput.disabled = false;
    ui.els.btnSaveNick.classList.remove('is-hidden');
    ui.els.btnEditNick.classList.add('is-hidden');
    ui.els.colorSel.classList.add('is-hidden');
    
    state.myColor = null;
    ui.resetColorButtons(state);
  });

  ui.els.colorCircles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.dataset.color;
      
      const takenBy = Object.entries(state.colorMap).find(([nick, c]) => c === color && nick !== state.myNick);
      if (takenBy) return Toast.warn(`[${CONFIG.TEAM_COLORS[color].name}色] 已被 ${takenBy[0]} 選擇`);

      if (state.myColor === color) {
        state.myColor = null;
        delete state.colorMap[state.myNick];
        ui.resetColorButtons(state);
        ui.els.colorWarn.classList.add('is-hidden');
      } else {
        state.myColor = color;
        state.colorMap[state.myNick] = color;
        ui.resetColorButtons(state);
        ui.els.colorWarn.classList.add('is-hidden');
        Toast.success(`已選擇 [${CONFIG.TEAM_COLORS[color].name}色]`);
      }

      // Sync color 
      if (state.peer && state.fullMyId) {
        const msg = { type: 'COLOR_SELECT', nick: state.myNick, color: state.myColor };
        if (state.isHost) {
          rm.broadcast({ type: 'COLOR_MAP', colorMap: { ...state.colorMap } });
        } else {
          const hostConn = Object.values(state.connections).find(c => c.nick === '房主');
          if (hostConn && hostConn.conn.open) hostConn.conn.send(msg);
        }
      }

      rm.refreshMemberList();
      if (ui.isSettingsCollapsed) ui.updateSummaryUI(state);
    });
  });

  ui.els.btnHost.addEventListener('click', () => rm.startHost());
  ui.els.btnJoin.addEventListener('click', () => rm.startJoin(ui.els.joinInput.value.trim()));
  ui.els.btnCopy.addEventListener('click', () => rm.copyInvite());
  ui.els.btnLeave.addEventListener('click', () => rm.leaveRoom());
  
  ui.els.btnReset.addEventListener('click', () => {
    if (confirm('確定清空所有標記？')) mapCtrl.resetAll();
  });
  
  ui.els.btnReload.addEventListener('click', () => location.reload());

  // 初始化檢查 Hash 房號
  const initialHash = window.location.hash.substring(1);
  if (initialHash) {
    ui.els.joinInput.value = initialHash;
  }
});

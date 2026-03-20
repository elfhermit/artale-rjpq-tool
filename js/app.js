// ============================================
// Artale RJPQ 跳平台輔助 - Firebase 雲端同步版
// ============================================
import { db, auth, signInAnonymously, onAuthStateChanged, ref, push, get, set, update, onValue, onDisconnect, remove, child } from './firebase-config.js';

// === 常數定義 ===
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

// === UI 連線日誌 ===
class UILogger {
  static log(msg, type = 'info') {
    const logBox = document.getElementById('ui-log');
    if (!logBox) return console.log(`[${type}] ${msg}`);
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${prefix} ${msg}</span>`;

    logBox.prepend(entry);
    
    // 更新標題列的預覽訊息
    const preview = document.getElementById('log-latest-msg');
    if (preview) preview.innerText = `│ ${prefix} ${msg}`;
  }
}

// === Toast 通知系統 ===
class Toast {
  static show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
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

// === 全域狀態管理器 ===
class AppState {
  constructor() {
    this.myNick = '';
    this.myColor = null;
    this.isHost = false;
    this.fullMyId = ''; // 對應 Firebase Room ID
    this.connections = {}; // { uid: { nick, color, isHost } }
    this.colorMap = {}; 
    
    // 初始化空地圖資料
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
      logPanel:    document.getElementById('log-panel'),
      logHeader:   document.getElementById('log-header'),
      logContainer:document.getElementById('ui-log'),
      logToggleIcon:document.getElementById('log-toggle-icon'),
      colorCircles: document.querySelectorAll('.color-circle')
    };

    this.isSettingsCollapsed = false;
  }

  setLoading(show, msg = '處理中...') {
    if (show) {
      this.els.load.classList.remove('is-hidden');
      this.els.load.style.display = 'flex';
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
    if (!state.fullMyId) return;
    const roomText = `房號: ${state.fullMyId.substring(1, 6)}...`;
    const colorKey = state.myColor ? state.myColor : 'no-color';
    const colorName = state.myColor ? CONFIG.TEAM_COLORS[state.myColor].name : '未選色';
    
    this.els.summaryInfo.innerHTML = `
      <strong>${roomText}</strong> | 
      <span class="summary-color-dot" style="background-color: var(--color-${colorKey});"></span>
      ${state.myNick} (${colorName})
    `;
  }

  resetColorButtons(state) {
    this.els.colorCircles.forEach(btn => btn.classList.remove('selected', 'taken'));

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

  renderMemberTags(membersObj, myNick, isHost) {
    this.els.memberList.innerHTML = '';
    // 自己永遠在第一位
    const mePill = document.createElement('span');
    const myColorClass = Object.values(membersObj).find(m => m.nick === myNick)?.color || 'no-color';
    mePill.className = `member-pill color-${myColorClass}`;
    mePill.innerText = `${myNick} ${isHost ? '(房主)' : ''}`;
    this.els.memberList.appendChild(mePill);

    Object.values(membersObj).forEach(m => {
      if (m.nick === myNick) return; // Skip self
      const pill = document.createElement('span');
      const colorClass = m.color ? `color-${m.color}` : 'no-color';
      pill.className = `member-pill ${colorClass}`;
      pill.innerText = `${m.nick} ${m.isHost ? '(房主)' : ''}`;
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


// === 地圖控制器 ===
class MapController {
  constructor(state, ui, roomManager) {
    this.state = state;
    this.ui = ui;
    this.rm = roomManager;
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
      
      // 同層不可重複標記
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
    
    // 如果連接上了 Firebase，則即時寫入
    if (this.rm.roomRef) {
      const cellRef = child(this.rm.roomRef, `mapData/${floorIndex}/${platformIndex}`);
      set(cellRef, { v, owner, color }).catch(e => UILogger.log(`同步節點失敗: ${e.message}`, 'error'));
    }
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
    if (this.rm.roomRef) {
      set(child(this.rm.roomRef, 'mapData'), this.state.mapData)
        .then(() => Toast.success('已清空地圖標記並同步至雲端'))
        .catch(e => UILogger.log(`清空同步失敗: ${e.message}`, 'error'));
    }
  }
}


// === 房間與網路管理器 (Firebase) ===
class FirebaseRoomManager {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.mapCtrl = null;
    this.uid = null;
    this.roomId = null;
    this.roomRef = null;
    this.unsubscribes = []; // For cleanup listener
  }

  setMapController(mc) { this.mapCtrl = mc; }

  initFirebase(onReady) {
    if (this.uid) return onReady();
    this.ui.setLoading(true, '連線至 Firebase Auth...');
    UILogger.log('正在嘗試匿名登入 Firebase...', 'info');

    signInAnonymously(auth).then(() => {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          this.uid = user.uid;
          this.ui.setLoading(false);
          UILogger.log(`Firebase 驗證成功 (UID: ${this.uid.slice(0, 5)}...)`, 'success');
          onReady();
        }
      });
    }).catch(err => {
      this.ui.setLoading(false);
      Toast.error('Firebase 登入失敗');
      UILogger.log(`Auth Error: ${err.message}`, 'error');
    });
  }

  startHost() {
    this.initFirebase(async () => {
      this.ui.setLoading(true, '建立房間中...');
      UILogger.log('正在 RTDB 建立房間...', 'info');
      
      const newRoomRef = push(ref(db, 'rooms'));
      this.roomId = newRoomRef.key;
      this.roomRef = newRoomRef;
      this.state.isHost = true;
      this.state.fullMyId = this.roomId;
      
      const payload = {
        meta: { hostNick: this.state.myNick, createdAt: Date.now() },
        members: {
          [this.uid]: { nick: this.state.myNick, color: this.state.myColor || null, isHost: true }
        },
        mapData: this.state.mapData,
        colorMap: this.state.myColor ? { [this.state.myNick]: this.state.myColor } : {}
      };

      try {
        await set(newRoomRef, payload);
        UILogger.log(`房間建立成功 (RoomID: ${this.roomId})`, 'success');
        
        // 離線自動刪除成員
        const myMemberRef = child(this.roomRef, `members/${this.uid}`);
        onDisconnect(myMemberRef).remove();
        
        this.setupSubscriptions();
        
        this.ui.els.connPanel.classList.add('is-hidden');
        this.ui.els.connActions.classList.remove('is-hidden');
        this.ui.els.btnReset.classList.remove('is-hidden');
        this.ui.els.logPanel.classList.remove('is-hidden');
        
        window.location.hash = this.roomId;
        Toast.success('房間已建立');
        
        this.ui.autoCollapseOnConnect();
        this.ui.updateSummaryUI(this.state);
        this.ui.setLoading(false);
      } catch (e) {
        this.ui.setLoading(false);
        UILogger.log(`建立房間失敗: ${e.message}`, 'error');
      }
    });
  }

  startJoin(targetId) {
    if (!targetId) return Toast.error('請貼上房間代碼！');
    // 如果網址傳入時帶有 `#`，進行過濾
    targetId = targetId.replace('#', '');

    this.initFirebase(async () => {
      this.ui.setLoading(true, '尋找房間...');
      UILogger.log(`嘗試加入房間: ${targetId}`, 'info');

      try {
        const roomSnapshot = await get(ref(db, `rooms/${targetId}`));
        if (!roomSnapshot.exists()) {
          this.ui.setLoading(false);
          UILogger.log('找不到該房號', 'error');
          return Toast.error('找不到該房號！請確認連結或代碼。');
        }

        const roomData = roomSnapshot.val();
        
        // 檢查暱稱衝突
        const isDup = Object.values(roomData.members || {}).some(user => user.nick === this.state.myNick);
        if (isDup) {
          this.ui.setLoading(false);
          UILogger.log(`暱稱 [${this.state.myNick}] 重複，加入失敗`, 'warn');
          return Toast.error(`暱稱「${this.state.myNick}」已有其他成員使用！`);
        }

        // 檢查選色衝突
        if (this.state.myColor && roomData.colorMap && Object.values(roomData.colorMap).includes(this.state.myColor)) {
           UILogger.log(`發現選色衝突，重設我的選色。`, 'warn');
           this.state.myColor = null;
        }

        this.roomId = targetId;
        this.roomRef = ref(db, `rooms/${this.roomId}`);
        this.state.isHost = false;
        this.state.fullMyId = this.roomId;

        // 寫入自己為成員
        this.state.connections = roomData.members || {};
        this.state.colorMap = roomData.colorMap || {};
        
        const updates = {};
        updates[`members/${this.uid}`] = { nick: this.state.myNick, color: this.state.myColor, isHost: false };
        if (this.state.myColor) {
          updates[`colorMap/${this.state.myNick}`] = this.state.myColor;
        }

        await update(this.roomRef, updates);
        
        const myMemberRef = child(this.roomRef, `members/${this.uid}`);
        onDisconnect(myMemberRef).remove();

        this.setupSubscriptions();
        
        // 更新地圖本機狀態
        if (roomData.mapData) {
          this.state.mapData = roomData.mapData;
          this.state.forEachPlatform((f, p, item) => this.ui.updatePlatformAppearance(f, p, item));
        }

        this.ui.resetColorButtons(this.state);
        
        this.ui.els.connPanel.classList.add('is-hidden');
        this.ui.els.connActions.classList.remove('is-hidden');
        this.ui.els.logPanel.classList.remove('is-hidden');
        this.ui.els.joinInput.value = '';
        
        history.replaceState(null, document.title, window.location.pathname);
        this.ui.autoCollapseOnConnect();
        this.ui.updateSummaryUI(this.state);
        
        Toast.success('加入房間成功！');
        UILogger.log(`加入房間成功 (${this.roomId})`, 'success');
        this.ui.setLoading(false);
      } catch (e) {
        this.ui.setLoading(false);
        UILogger.log(`加入房間失敗: ${e.message}`, 'error');
      }
    });
  }

  setupSubscriptions() {
    // 監聽成員變更
    const membersUnsub = onValue(child(this.roomRef, 'members'), (snapshot) => {
      const membersObj = snapshot.val() || {};
      
      // 找出離線的玩家清除標記
      Object.keys(this.state.connections).forEach(oldUid => {
        if (!membersObj[oldUid]) {
           const leftUser = this.state.connections[oldUid];
           UILogger.log(`成員離開: ${leftUser.nick}`, 'warn');
           this.mapCtrl.removeUserMarkers(leftUser.nick);
        }
      });

      // 檢查新加入的玩家
      Object.keys(membersObj).forEach(newUid => {
        if (!this.state.connections[newUid]) {
           UILogger.log(`成員加入: ${membersObj[newUid].nick}`, 'success');
        }
      });

      this.state.connections = membersObj;
      this.ui.renderMemberTags(membersObj, this.state.myNick, this.state.isHost);
    });
    this.unsubscribes.push(membersUnsub);

    // 監聽顏色對應表變更
    const colorMapUnsub = onValue(child(this.roomRef, 'colorMap'), (snapshot) => {
      this.state.colorMap = snapshot.val() || {};
      if (this.state.myColor && this.state.colorMap[this.state.myNick] !== this.state.myColor) {
        if (!this.state.colorMap[this.state.myNick]) {
           // 被別人清空了？重新宣告自己
           update(child(this.roomRef, 'colorMap'), { [this.state.myNick]: this.state.myColor });
        }
      }
      this.ui.resetColorButtons(this.state);
    });
    this.unsubscribes.push(colorMapUnsub);

    // 監聽地圖資料變更
    const mapDataUnsub = onValue(child(this.roomRef, 'mapData'), (snapshot) => {
      const data = snapshot.val();
      if (!data) return; // Wait
      
      for (let f = 0; f < CONFIG.MAP_LAYERS; f++) {
        for (let p = 0; p < CONFIG.MAP_PLATFORMS; p++) {
          if (data[f] && data[f][p]) {
            const remoteItem = data[f][p];
            const localItem = this.state.mapData[f][p];
            if (localItem.v !== remoteItem.v || localItem.owner !== remoteItem.owner) {
              this.state.mapData[f][p] = remoteItem;
              this.ui.updatePlatformAppearance(f, p, remoteItem);
            }
          }
        }
      }
    });
    this.unsubscribes.push(mapDataUnsub);

    // 監聽房間是否存在 (Host 刪除房間時)
    const metaUnsub = onValue(child(this.roomRef, 'meta'), (snapshot) => {
       if (!snapshot.exists() && this.roomId) {
          Toast.error('房間已解散。');
          UILogger.log('偵測到房間被移除 (可能房主離線或清空)', 'error');
          this.leaveRoom(true); 
       }
    });
    this.unsubscribes.push(metaUnsub);
  }

  handleColorSelect(colorCode) {
    const colorName = CONFIG.TEAM_COLORS[colorCode].name;
    const takenBy = Object.entries(this.state.colorMap).find(([nick, c]) => c === colorCode && nick !== this.state.myNick);
    
    if (takenBy) {
      UILogger.log(`顏色衝突: ${takenBy[0]} 已經選擇了 ${colorName}`, 'warn');
      return Toast.warn(`[${colorName}色] 已被 ${takenBy[0]} 選擇`);
    }

    if (this.state.myColor === colorCode) {
      this.state.myColor = null;
      delete this.state.colorMap[this.state.myNick];
      UILogger.log(`取消選擇顏色`, 'info');
      
      if (this.roomRef) {
        remove(child(this.roomRef, `colorMap/${this.state.myNick}`));
        remove(child(this.roomRef, `members/${this.uid}/color`));
      }
    } else {
      this.state.myColor = colorCode;
      this.state.colorMap[this.state.myNick] = colorCode;
      Toast.success(`已選擇 [${colorName}色]`);
      UILogger.log(`已選擇 ${colorName}色`, 'success');
      
      if (this.roomRef) {
        set(child(this.roomRef, `colorMap/${this.state.myNick}`), colorCode);
        set(child(this.roomRef, `members/${this.uid}/color`), colorCode);
      }
    }
    
    this.ui.resetColorButtons(this.state);
    if (this.ui.isSettingsCollapsed) this.ui.updateSummaryUI(this.state);
  }

  leaveRoom(forced = false) {
    if (this.unsubscribes) {
      this.unsubscribes.forEach(u => u());
      this.unsubscribes = [];
    }
    
    if (this.roomRef && !forced) {
       if (this.state.isHost) {
          UILogger.log('房主離開，銷毀房間...', 'warn');
          remove(this.roomRef);
       } else {
          UILogger.log('離開房間...', 'info');
          remove(child(this.roomRef, `members/${this.uid}`));
          remove(child(this.roomRef, `colorMap/${this.state.myNick}`));
       }
    }
    
    // onDisconnect cleanup - we don't need to explicitly cancel unless we want to, but removing from DB does it.

    this.state.isHost = false; 
    this.state.fullMyId = ''; 
    this.state.connections = {};
    this.state.colorMap = {}; 
    if (this.state.myColor) this.state.colorMap[this.state.myNick] = this.state.myColor;
    this.roomId = null;
    this.roomRef = null;
    
    this.mapCtrl.clearLocal();

    this.ui.els.initActions.classList.remove('is-hidden');
    this.ui.els.connPanel.classList.remove('is-hidden');
    this.ui.els.connActions.classList.add('is-hidden');
    this.ui.els.btnReset.classList.add('is-hidden');
    this.ui.els.logPanel.classList.add('is-hidden');
    this.ui.els.memberList.innerHTML = '';
    
    document.getElementById('ui-log').innerHTML = '';
    
    this.ui.resetColorButtons(this.state);
    this.ui.resetSettingsCollapse();
    if (!forced) Toast.warn('已離開房間。');
  }

  copyInvite() {
    const url = window.location.origin + window.location.pathname + '#' + this.state.fullMyId;
    navigator.clipboard.writeText(url).then(() => {
      Toast.success('邀請連結已複製！');
      UILogger.log('邀請連結複製成功', 'info');
    }).catch(() => prompt('請手動複製：', url));
  }
}

// === 主程式邏輯 (Application Bootstrap) ===
document.addEventListener('DOMContentLoaded', () => {
  const state = new AppState();
  const ui = new UIManager();
  const rm = new FirebaseRoomManager(state, ui);
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

  if (ui.els.logHeader) {
    ui.els.logHeader.addEventListener('click', () => {
      const isHidden = ui.els.logContainer.classList.contains('is-hidden');
      if (isHidden) {
        ui.els.logContainer.classList.remove('is-hidden');
        ui.els.logToggleIcon.innerText = '▲';
      } else {
        ui.els.logContainer.classList.add('is-hidden');
        ui.els.logToggleIcon.innerText = '▼';
      }
    });
  }

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
  });

  ui.els.btnEditNick.addEventListener('click', () => {
    if (!confirm('修改角色將斷開房間連線，確定嗎？')) return;
    if (rm.roomRef) rm.leaveRoom(true);
    
    ui.els.nickInput.disabled = false;
    ui.els.btnSaveNick.classList.remove('is-hidden');
    ui.els.btnEditNick.classList.add('is-hidden');
    ui.els.colorSel.classList.add('is-hidden');
    
    state.myColor = null;
    ui.resetColorButtons(state);
  });

  ui.els.colorCircles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      rm.handleColorSelect(e.target.dataset.color);
    });
  });

  ui.els.btnHost.addEventListener('click', () => rm.startHost());
  ui.els.btnJoin.addEventListener('click', () => rm.startJoin(ui.els.joinInput.value.trim()));
  ui.els.btnCopy.addEventListener('click', () => rm.copyInvite());
  ui.els.btnLeave.addEventListener('click', () => {
    if (confirm('確定要離開房間嗎？')) rm.leaveRoom(false);
  });
  
  ui.els.btnReset.addEventListener('click', () => {
    if (confirm('確定清空所有標記？此動作將同步至所有成員。')) mapCtrl.resetAll();
  });
  
  ui.els.btnReload.addEventListener('click', () => location.reload());

  // 網址 Hash 初始化
  const initialHash = window.location.hash.substring(1);
  if (initialHash) {
    ui.els.joinInput.value = initialHash;
  }
});

/**
 * icloudSync.js - 喵的粮仓 iCloud 云端备份桥接与网页端优雅降级模块
 * 纯前端安全实现：在网页端、安卓端或未登录 iCloud 时静默降级为本地备份快照，绝不抛错阻断主流程。
 */
(function (global) {
  'use strict';

  const LS_ENABLED_KEY = 'miaowu_icloud_auto_backup';
  const LS_LAST_BACKUP_KEY = 'miaowu_icloud_last_backup';
  const LS_LOCAL_SNAPSHOT_KEY = 'miaowu_local_cloud_backup_snapshot';
  const IDB_NAME = 'MiaowuCloudFallbackDB';
  const IDB_STORE = 'snapshots';
  const IDB_KEY = 'latest_backup';

  function getNativePlugin() {
    try {
      return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.ICloudSync) || null;
    } catch (_) {
      return null;
    }
  }

  function openFallbackDB() {
    return new Promise((resolve, reject) => {
      try {
        if (typeof global.indexedDB === 'undefined') {
          reject(new Error('IndexedDB unavailable'));
          return;
        }
        const req = global.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error || new Error('Open fallback DB failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async function saveLocalSnapshot(payloadObj, timestamp) {
    const record = {
      id: IDB_KEY,
      updatedAt: timestamp,
      payload: JSON.stringify(payloadObj)
    };
    try {
      const db = await openFallbackDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([IDB_STORE], 'readwrite');
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      // IndexedDB 不可用时降级写入 localStorage（忽略体积超限）
      try {
        if (typeof global.localStorage !== 'undefined') {
          global.localStorage.setItem(LS_LOCAL_SNAPSHOT_KEY, record.payload);
        }
      } catch (__) { /* ignore quota errors */ }
    }
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(LS_LAST_BACKUP_KEY, String(timestamp));
      }
    } catch (_) { /* ignore */ }
  }

  async function loadLocalSnapshot() {
    try {
      const db = await openFallbackDB();
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction([IDB_STORE], 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (rec && rec.payload) {
        return { data: JSON.parse(rec.payload), updatedAt: rec.updatedAt || 0 };
      }
    } catch (_) { /* fallback to localStorage */ }

    try {
      if (typeof global.localStorage !== 'undefined') {
        const raw = global.localStorage.getItem(LS_LOCAL_SNAPSHOT_KEY);
        if (raw) {
          const ts = Number(global.localStorage.getItem(LS_LAST_BACKUP_KEY) || 0);
          return { data: JSON.parse(raw), updatedAt: ts };
        }
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  async function checkAvailability() {
    try {
      const plugin = getNativePlugin();
      if (!plugin) {
        return {
          available: false,
          reason: '网页版暂不支持 iCloud 直连，数据已安全保存在本地'
        };
      }
      const fn = plugin.checkAvailability || plugin.isAvailable;
      if (typeof fn !== 'function') {
        return {
          available: false,
          reason: '当前环境未启用 iCloud 权限或未登录 Apple ID'
        };
      }
      const res = await fn.call(plugin);
      if (res && res.available) {
        return {
          available: true,
          reason: res.reason || 'iCloud 云端同步已就绪'
        };
      }
      return {
        available: false,
        reason: (res && res.reason) || '当前未登录 iCloud 或未启用权限，数据已安全保存在本地'
      };
    } catch (_) {
      return {
        available: false,
        reason: '网页版暂不支持 iCloud 直连，数据已安全保存在本地'
      };
    }
  }

  async function backupNow(jsonData) {
    const now = Date.now();
    try {
      const dataObj = typeof jsonData === 'string' ? JSON.parse(jsonData) : (jsonData || {});
      const payload = Object.assign({}, dataObj, { backupTimestamp: now });
      const status = await checkAvailability();

      if (status.available) {
        const plugin = getNativePlugin();
        const writeFn = plugin && (plugin.backupNow || plugin.writeBackup);
        if (typeof writeFn === 'function') {
          try {
            if (typeof plugin.getMetadata === 'function') {
              const meta = await plugin.getMetadata();
              if (meta && meta.updatedAt && Number(meta.updatedAt) > now) {
                return { ok: true, mode: 'icloud', skipped: true, timestamp: Number(meta.updatedAt), reason: '云端已有更新备份，已跳过覆盖' };
              }
            }
            await writeFn.call(plugin, { data: JSON.stringify(payload), timestamp: now });
            await saveLocalSnapshot(payload, now);
            return { ok: true, mode: 'icloud', timestamp: now, reason: '已同步至 iCloud 云端' };
          } catch (_) {
            // 原生写入失败时静默降级至本地快照
          }
        }
      }

      await saveLocalSnapshot(payload, now);
      return {
        ok: true,
        mode: 'local',
        timestamp: now,
        reason: '已安全保存在本地，开启 iCloud 后自动同步'
      };
    } catch (err) {
      return {
        ok: false,
        mode: 'local',
        timestamp: now,
        reason: (err && err.message) ? err.message : '本地备份异常'
      };
    }
  }

  async function restoreFromCloud() {
    try {
      const status = await checkAvailability();
      if (status.available) {
        const plugin = getNativePlugin();
        const readFn = plugin && (plugin.restoreFromCloud || plugin.readBackup);
        if (typeof readFn === 'function') {
          try {
            const res = await readFn.call(plugin);
            const raw = res && (res.data || res.payload || res);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === 'object') {
              return { ok: true, mode: 'icloud', data: parsed, timestamp: parsed.backupTimestamp || Date.now() };
            }
          } catch (_) {
            // 回退读取本地快照
          }
        }
      }

      const localSnap = await loadLocalSnapshot();
      if (localSnap && localSnap.data) {
        return { ok: true, mode: 'local', data: localSnap.data, timestamp: localSnap.updatedAt };
      }
      return { ok: false, mode: 'local', reason: '暂无可用的云端或本地备份快照' };
    } catch (err) {
      return { ok: false, mode: 'local', reason: (err && err.message) ? err.message : '读取备份失败' };
    }
  }

  function isAutoBackupEnabled() {
    try {
      return typeof global.localStorage !== 'undefined' && global.localStorage.getItem(LS_ENABLED_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function setAutoBackupEnabled(enabled) {
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(LS_ENABLED_KEY, enabled ? 'true' : 'false');
      }
    } catch (_) { /* ignore */ }
  }

  function getLastBackupTime() {
    try {
      if (typeof global.localStorage !== 'undefined') {
        const v = Number(global.localStorage.getItem(LS_LAST_BACKUP_KEY) || 0);
        return v > 0 ? v : null;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  const api = {
    checkAvailability,
    backupNow,
    restoreFromCloud,
    isAutoBackupEnabled,
    setAutoBackupEnabled,
    getLastBackupTime
  };

  global.MiaowuCloudSync = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * biometricLock.js - 喵的粮仓 Face ID / 生物认证与触觉反馈桥接模块
 * 纯前端安全实现：
 * 1. 复用现有「暗号」(app_password_hash) 作为唯一主密码，不另建第二套密码；
 * 2. 兼容 Capacitor 原生插件 (window.Capacitor?.Plugins?.BiometricAuth / Haptics) 与 iOS Safari/PWA WebAuthn；
 * 3. 所有底层调用均包裹在 try/catch 中，不支持环境静默降级，绝不阻塞主流程。
 */
(function (global) {
  'use strict';

  const LS_PASSWORD_HASH = 'app_password_hash';
  const LS_BIOMETRIC_ENABLED = 'miaowu_biometric_enabled';
  const LS_BIOMETRIC_CRED_ID = 'miaowu_biometric_cred_id';
  const LS_BIOMETRIC_USER_ID = 'miaowu_biometric_user_id';

  function getNativeHapticsPlugin() {
    try {
      return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) || null;
    } catch (_) {
      return null;
    }
  }

  function getNativeBiometricPlugin() {
    try {
      const plugins = global.Capacitor && global.Capacitor.Plugins;
      return (plugins && (plugins.BiometricAuth || plugins.NativeBiometric)) || null;
    } catch (_) {
      return null;
    }
  }

  function triggerNativeOrVibrate(kind, nativeArg, vibratePattern) {
    try {
      const plugin = getNativeHapticsPlugin();
      if (plugin) {
        const fn = kind === 'impact' ? plugin.impact : plugin.notification;
        if (typeof fn === 'function') {
          const payload = kind === 'impact' ? { style: nativeArg } : { type: nativeArg };
          Promise.resolve(fn.call(plugin, payload)).catch(() => {});
          return true;
        }
      }
      if (typeof global.navigator !== 'undefined' && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate(vibratePattern);
        return true;
      }
    } catch (_) {
      // iOS Safari 等不支持底层震动的环境静默降级
    }
    return false;
  }

  const MiaowuHaptics = {
    light() {
      return triggerNativeOrVibrate('impact', 'LIGHT', 10);
    },
    medium() {
      return triggerNativeOrVibrate('impact', 'MEDIUM', 18);
    },
    success() {
      return triggerNativeOrVibrate('notification', 'SUCCESS', [12, 30, 18]);
    },
    error() {
      return triggerNativeOrVibrate('notification', 'ERROR', [25, 35, 25, 35, 25]);
    }
  };

  function safeStorageGet(key) {
    try {
      return typeof global.localStorage !== 'undefined' ? global.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, val) {
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(key, String(val));
      }
    } catch (_) {
      // ignore
    }
  }

  function safeStorageRemove(key) {
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.removeItem(key);
      }
    } catch (_) {
      // ignore
    }
  }

  function hasMainPassword() {
    return !!safeStorageGet(LS_PASSWORD_HASH);
  }

  function randomBytes(len) {
    const arr = new Uint8Array(len);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return arr;
  }

  function bufferToBase64Url(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return global.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToUint8Array(base64Url) {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = global.atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      out[i] = raw.charCodeAt(i);
    }
    return out;
  }

  function getOrCreateUserIdBytes() {
    const existing = safeStorageGet(LS_BIOMETRIC_USER_ID);
    if (existing) {
      try {
        return base64UrlToUint8Array(existing);
      } catch (_) {
        // regenerate if corrupted
      }
    }
    const bytes = randomBytes(16);
    try {
      safeStorageSet(LS_BIOMETRIC_USER_ID, bufferToBase64Url(bytes));
    } catch (_) {
      // ignore
    }
    return bytes;
  }

  function isSupported() {
    try {
      if (getNativeBiometricPlugin()) return true;
      if (global.isSecureContext === false) return false;
      return !!(
        typeof global.PublicKeyCredential !== 'undefined' &&
        global.navigator &&
        global.navigator.credentials &&
        typeof global.navigator.credentials.create === 'function' &&
        typeof global.navigator.credentials.get === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  async function checkAvailability() {
    try {
      const plugin = getNativeBiometricPlugin();
      if (plugin) {
        const fn = plugin.checkBiometry || plugin.isAvailable;
        if (typeof fn === 'function') {
          const res = await fn.call(plugin);
          const available = !!(res && (res.isAvailable !== false && res.available !== false));
          return {
            supported: available,
            mode: 'native',
            reason: available ? '原生生物识别已就绪' : '设备未开启 Face ID / Touch ID'
          };
        }
        return { supported: true, mode: 'native', reason: '原生生物识别插件已就绪' };
      }

      if (!isSupported()) {
        return {
          supported: false,
          mode: 'none',
          reason: '当前浏览器环境不支持 WebAuthn 平台生物认证（需 HTTPS 或主屏幕 PWA）'
        };
      }

      if (typeof global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const platformOk = await global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        return {
          supported: !!platformOk,
          mode: platformOk ? 'webauthn' : 'none',
          reason: platformOk ? '本机 Face ID / Touch ID 平台认证器已就绪' : '当前设备未启用本机生物认证'
        };
      }

      return { supported: true, mode: 'webauthn', reason: 'WebAuthn 平台认证器已就绪' };
    } catch (_) {
      return { supported: false, mode: 'none', reason: '生物认证检测异常，已安全降级' };
    }
  }

  function isEnabled() {
    if (!hasMainPassword()) return false;
    if (safeStorageGet(LS_BIOMETRIC_ENABLED) !== 'true') return false;
    return !!(getNativeBiometricPlugin() || safeStorageGet(LS_BIOMETRIC_CRED_ID));
  }

  function disable() {
    safeStorageRemove(LS_BIOMETRIC_ENABLED);
    safeStorageRemove(LS_BIOMETRIC_CRED_ID);
  }

  async function invokeNativeAuth(plugin, reason) {
    const authFn = plugin.authenticate || plugin.verifyIdentity;
    if (typeof authFn !== 'function') {
      throw new Error('Native biometric authenticate method unavailable');
    }
    const res = await authFn.call(plugin, {
      reason: reason || '验证 Face ID 解锁喵的粮仓',
      allowDeviceCredential: true
    });
    if (res && res.verified === false) {
      throw new Error('Biometric verification failed');
    }
    return true;
  }

  async function register() {
    try {
      if (!hasMainPassword()) {
        return {
          ok: false,
          needPassword: true,
          message: '请先约定「暗号」主密码，再开启 Face ID 快捷解锁'
        };
      }
      if (!isSupported()) {
        return {
          ok: false,
          message: '当前环境不支持本机 Face ID / 生物认证（请使用 iOS Safari / 主屏幕 PWA HTTPS 环境）'
        };
      }

      const plugin = getNativeBiometricPlugin();
      if (plugin) {
        await invokeNativeAuth(plugin, '验证身份以开启 Face ID 快捷解锁');
        safeStorageSet(LS_BIOMETRIC_ENABLED, 'true');
        return { ok: true, mode: 'native' };
      }

      const challenge = randomBytes(32);
      const userIdBytes = getOrCreateUserIdBytes();
      const credential = await global.navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: '喵的粮仓'
          },
          user: {
            id: userIdBytes,
            name: 'miaowu-owner',
            displayName: '喵的粮仓主人'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
            requireResidentKey: false
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      if (!credential || !credential.rawId) {
        return { ok: false, message: '未获取到有效的 Face ID 凭证' };
      }

      const credentialId = bufferToBase64Url(credential.rawId);
      safeStorageSet(LS_BIOMETRIC_CRED_ID, credentialId);
      safeStorageSet(LS_BIOMETRIC_ENABLED, 'true');
      return { ok: true, mode: 'webauthn', credentialId };
    } catch (err) {
      const name = (err && err.name) || 'Error';
      const canceled = name === 'NotAllowedError' || name === 'AbortError';
      return {
        ok: false,
        errorName: name,
        canceled,
        message: canceled ? '已取消或未完成 Face ID 验证' : 'Face ID 注册失败，请稍后重试'
      };
    }
  }

  async function verify() {
    try {
      if (!hasMainPassword()) {
        return { ok: false, message: '未设置主暗号' };
      }
      if (!isEnabled()) {
        return { ok: false, message: '未开启 Face ID 快捷解锁' };
      }

      const plugin = getNativeBiometricPlugin();
      if (plugin) {
        await invokeNativeAuth(plugin, '使用 Face ID 解锁喵的粮仓');
        return { ok: true, mode: 'native' };
      }

      const credIdB64 = safeStorageGet(LS_BIOMETRIC_CRED_ID);
      if (!credIdB64) {
        return { ok: false, message: '未找到本机 Face ID 凭证，请使用暗号解锁' };
      }

      const credIdBytes = base64UrlToUint8Array(credIdB64);
      const challenge = randomBytes(32);

      const assertion = await global.navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              type: 'public-key',
              id: credIdBytes,
              transports: ['internal']
            }
          ],
          userVerification: 'required',
          timeout: 60000
        }
      });

      if (assertion && assertion.rawId) {
        return { ok: true, mode: 'webauthn' };
      }
      return { ok: false, message: 'Face ID 验证未通过' };
    } catch (err) {
      const name = (err && err.name) || 'Error';
      const canceled = name === 'NotAllowedError' || name === 'AbortError';
      return {
        ok: false,
        errorName: name,
        canceled,
        message: canceled ? '已取消 Face ID 验证，可直接输入暗号解锁' : 'Face ID 验证失败，请使用暗号解锁'
      };
    }
  }

  global.MiaowuHaptics = MiaowuHaptics;
  global.MiaowuLock = {
    isSupported,
    checkAvailability,
    isEnabled,
    register,
    verify,
    disable
  };
})(typeof window !== 'undefined' ? window : globalThis);

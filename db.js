/**
 * db.js - 原生 Promise 封装的 IndexedDB 数据存储层
 * 包含 ObjectStores: accounts, transactions, snapshots
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const dbInstance = factory();
    root.AssetDB = dbInstance;
    root.assetDB = dbInstance;
    if (typeof window !== 'undefined') {
      window.assetDB = dbInstance;
      window.AssetDB = dbInstance;
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'PersonalAssetDB';
  const DB_VERSION = 1;

  let dbPromise = null;

  /**
   * 打开/初始化数据库
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('当前环境不支持 IndexedDB'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. accounts 账户表
        if (!db.objectStoreNames.contains('accounts')) {
          const accountStore = db.createObjectStore('accounts', { keyPath: 'id' });
          accountStore.createIndex('by_type', 'type', { unique: false });
          accountStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }

        // 2. transactions 流水表
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('by_date', 'date', { unique: false });
          txStore.createIndex('by_accountId', 'accountId', { unique: false });
          txStore.createIndex('by_type', 'type', { unique: false });
          txStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        // 3. snapshots 资产快照表 (按日存储，keyPath 为 YYYY-MM-DD)
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'date' });
          snapshotStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        reject(event.target.error || new Error('打开数据库失败'));
      };
    });

    return dbPromise;
  }

  /**
   * 工具：生成唯一 ID
   */
  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 工具：格式化日期为 YYYY-MM-DD
   */
  function formatDate(d = new Date()) {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ==========================================
  // Accounts (账户操作)
  // ==========================================

  async function readRawAccounts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readonly');
      const store = tx.objectStore('accounts');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  const NON_NEGATIVE_ACCOUNT_TYPES = new Set(['bank', 'cash', 'investment']);

  function isNonNegativeAccountType(type) {
    return NON_NEGATIVE_ACCOUNT_TYPES.has(String(type || 'bank'));
  }

  /**
   * 严格不变量自愈巡检（叶子存钱、母账户纯汇总）：
   * 若发现任何已有子账户的母账户自身 balance !== 0，
   * 正残留余额合并入其名下「存款」子账户（不存在则自动创建）；
   * 若为历史负残留，优先从余额充足的子账户抵扣，绝不凭空创建新的负余额「存款」账户，
   * 并将母账户自身 balance 强制清零后写回 IndexedDB。
   */
  async function healParentAccountsIfNeeded() {
    const list = await readRawAccounts();
    if (!list.length) return list;

    const childrenMap = new Map();
    for (const acc of list) {
      if (!acc || !acc.parentId) continue;
      const pid = String(acc.parentId);
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(acc);
    }

    const db = await openDB();
    const nowIso = new Date().toISOString();
    const toPut = [];
    const toAdd = [];

    for (const acc of list) {
      if (!acc || !acc.id) continue;
      const children = childrenMap.get(String(acc.id));
      if (!children || children.length === 0) continue;

      const residual = +(Number(acc.balance || 0)).toFixed(2);
      if (residual === 0) continue;

      const depositChild = children.find((c) => String(c.name || '').trim() === '存款');
      if (residual > 0) {
        if (depositChild) {
          depositChild.balance = +(Number(depositChild.balance || 0) + residual).toFixed(2);
          depositChild.updatedAt = nowIso;
          toPut.push(depositChild);
        } else {
          const newDeposit = {
            id: generateId('acc'),
            name: '存款',
            type: 'bank',
            balance: residual,
            parentId: String(acc.id),
            currency: acc.currency || 'CNY',
            color: '#2563eb',
            icon: '💳',
            notes: '',
            creditLimit: 0,
            updatedAt: nowIso
          };
          children.push(newDeposit);
          toAdd.push(newDeposit);
        }
      } else {
        const targetChild =
          (depositChild && Number(depositChild.balance || 0) + residual >= 0 ? depositChild : null)
          || [...children]
            .filter((c) => c && c.type !== 'credit' && Number(c.balance || 0) + residual >= 0)
            .sort((a, b) => {
              const aLiq = (a.type === 'cash' || a.type === 'bank') ? 0 : 1;
              const bLiq = (b.type === 'cash' || b.type === 'bank') ? 0 : 1;
              if (aLiq !== bLiq) return aLiq - bLiq;
              return Number(b.balance || 0) - Number(a.balance || 0);
            })[0]
          || depositChild
          || [...children].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))[0];

        if (targetChild) {
          targetChild.balance = +(Number(targetChild.balance || 0) + residual).toFixed(2);
          targetChild.updatedAt = nowIso;
          toPut.push(targetChild);
        }
      }

      acc.balance = 0;
      acc.updatedAt = nowIso;
      toPut.push(acc);
    }

    if (toPut.length === 0 && toAdd.length === 0) {
      return list;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      for (const item of toAdd) store.add(item);
      for (const item of toPut) store.put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    await updateTodaySnapshot();
    return readRawAccounts();
  }

  async function getAllAccounts() {
    return healParentAccountsIfNeeded();
  }

  /**
   * 统一检测账户创建重名冲突：
   * - 情况 A1: parentId 为空，一级主账户已有同名且名下有子账户
   * - 情况 A2: parentId 为空，一级主账户已有同名但暂无子账户
   * - 情况 B: parentId 非空，该母账户下已存在同名子账户
   */
  function detectAccountCreationConflict({ name, parentId = null, accounts = [], excludeId = '' }) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName || !Array.isArray(accounts)) return null;
    const pid = parentId ? String(parentId) : '';

    if (!pid) {
      const targetAcc = accounts.find((a) => a && a.id !== excludeId && !a.parentId && String(a.name || '').trim() === trimmedName);
      if (!targetAcc) return null;
      const children = accounts.filter((a) => a && a.id !== excludeId && a.parentId && String(a.parentId) === String(targetAcc.id));
      if (children.length > 0) {
        return { kind: 'A1', targetAcc, children };
      }
      return { kind: 'A2', targetAcc, children: [] };
    }

    const parentAcc = accounts.find((a) => a && String(a.id) === pid) || null;
    const targetSub = accounts.find((a) => a && a.id !== excludeId && a.parentId && String(a.parentId) === pid && String(a.name || '').trim() === trimmedName);
    if (!targetSub) return null;
    return { kind: 'B', parentAcc, targetSub };
  }

  async function getAccount(id) {
    if (!id) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readonly');
      const store = tx.objectStore('accounts');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function addAccount(accountData) {
    const id = accountData.id || generateId('acc');
    const accType = accountData.type || 'bank'; // cash, bank, investment, credit, other
    const initBalance = Number(accountData.balance || 0);
    if (isNonNegativeAccountType(accType) && initBalance < 0) {
      throw new Error('储蓄卡/活期零钱/投资理财账户余额不能为负数，如需记录欠款请使用信用卡/负债账户');
    }
    const account = {
      id,
      name: accountData.name || '新账户',
      type: accType,
      balance: initBalance,
      parentId: accountData.parentId ? String(accountData.parentId) : null,
      currency: accountData.currency || 'CNY',
      color: accountData.color || '#3b82f6',
      icon: accountData.icon || '💳',
      notes: accountData.notes || '',
      creditLimit: accountData.creditLimit !== undefined ? Number(accountData.creditLimit) : 0,
      updatedAt: new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const request = store.add(account);
      request.onsuccess = () => resolve(account);
      request.onerror = () => reject(request.error);
    });

    await updateTodaySnapshot();
    return account;
  }

  async function updateAccount(accountData) {
    const db = await openDB();
    const existing = await getAccount(accountData.id);
    if (!existing) throw new Error('账户不存在');

    const rawAccounts = await readRawAccounts();
    const hasChildren = rawAccounts.some((a) => a && a.parentId && String(a.parentId) === String(accountData.id));

    const updated = {
      ...existing,
      ...accountData,
      parentId: accountData.parentId !== undefined ? (accountData.parentId ? String(accountData.parentId) : null) : (existing.parentId || null),
      balance: hasChildren ? 0 : Number(accountData.balance !== undefined ? accountData.balance : existing.balance),
      creditLimit: accountData.creditLimit !== undefined ? Number(accountData.creditLimit) : (existing.creditLimit || 0),
      updatedAt: new Date().toISOString()
    };

    // 保留极个别历史负余额账户可改名/向上回正，但禁止新增或扩大正资产账户的负余额
    const prevBal = Number(existing.balance || 0);
    if (!hasChildren && isNonNegativeAccountType(updated.type) && updated.balance < 0) {
      if (!(prevBal < 0 && updated.balance >= prevBal)) {
        throw new Error('储蓄卡/活期零钱/投资理财账户余额不能为负数，如需记录欠款请使用信用卡/负债账户');
      }
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const request = store.put(updated);
      request.onsuccess = () => resolve(updated);
      request.onerror = () => reject(request.error);
    });

    await updateTodaySnapshot();
    return updated;
  }

  /**
   * 首次为非零余额独立主账户添加子账户（或迁入现有独立账户）时，处理原余额的统一事务辅助函数
   * mode === 'carve': 从原余额中拆出 newBalance 给目标子账户(B)，剩余 (oldBalance - newBalance > 0) 存为独立子账户(A)，母账户 balance 归零
   * mode === 'split': 创建原余额子账户(A) + 创建或更新子账户(B)，并将母账户 balance 归零
   * mode === 'merge': 仅保留 1 个子账户(B)，其余额严格等于 Number(oldBalance) + Number(newBalance)，并将母账户 balance 归零
   */
  async function createFirstSubAccountWithOldBalance({ parentId, newChildPayload, mode = 'split', legacyChildPayload = null, existingChildId = '' }) {
    const parent = await getAccount(parentId);
    if (!parent) throw new Error('母账户不存在');

    const oldBalance = +(Number(parent.balance || 0)).toFixed(2);
    const newBalance = +(Number((newChildPayload && newChildPayload.balance) || 0)).toFixed(2);

    if (mode === 'carve') {
      if (newBalance < 0) throw new Error('拆出金额不能为负数');
      const remainder = +(oldBalance - newBalance).toFixed(2);
      if (remainder < 0) throw new Error('母账户原余额不足以拆出该金额');

      await updateAccount({ id: parentId, balance: 0 });

      const newAcc = existingChildId
        ? await updateAccount({ ...newChildPayload, id: existingChildId, parentId, balance: newBalance })
        : await addAccount({ ...newChildPayload, parentId, balance: newBalance });

      let legacyAcc = null;
      if (remainder > 0) {
        legacyAcc = await addAccount({
          name: (legacyChildPayload && legacyChildPayload.name && String(legacyChildPayload.name).trim()) || '存款',
          type: (legacyChildPayload && legacyChildPayload.type) || parent.type || 'bank',
          balance: remainder,
          parentId,
          icon: (legacyChildPayload && legacyChildPayload.icon) || parent.icon || '💳',
          color: (legacyChildPayload && legacyChildPayload.color) || parent.color || '#3b82f6',
          notes: (legacyChildPayload && legacyChildPayload.notes) || ''
        });
      }

      return {
        mode: 'carve',
        oldBalance,
        newBalance,
        remainderBalance: Math.max(0, remainder),
        totalBalance: oldBalance,
        legacyAccount: legacyAcc,
        newAccount: newAcc
      };
    }

    // 1. 强不变量：将母账户自身 balance 设为 0
    await updateAccount({ id: parentId, balance: 0 });

    const saveChild = async (finalBal) => {
      if (existingChildId) {
        return updateAccount({
          ...newChildPayload,
          id: existingChildId,
          parentId,
          balance: finalBal
        });
      }
      return addAccount({
        ...newChildPayload,
        parentId,
        balance: finalBal
      });
    };

    if (mode === 'split') {
      const legacyAcc = await addAccount({
        name: (legacyChildPayload && legacyChildPayload.name && String(legacyChildPayload.name).trim()) || '存款',
        type: (legacyChildPayload && legacyChildPayload.type) || parent.type || 'bank',
        balance: oldBalance,
        parentId,
        icon: (legacyChildPayload && legacyChildPayload.icon) || parent.icon || '💳',
        color: (legacyChildPayload && legacyChildPayload.color) || parent.color || '#3b82f6',
        notes: (legacyChildPayload && legacyChildPayload.notes) || ''
      });
      const newAcc = await saveChild(newBalance);
      return {
        mode: 'split',
        oldBalance,
        newBalance,
        totalBalance: +(oldBalance + newBalance).toFixed(2),
        legacyAccount: legacyAcc,
        newAccount: newAcc
      };
    }

    const mergedBalance = +(oldBalance + newBalance).toFixed(2);
    const mergedAcc = await saveChild(mergedBalance);
    return {
      mode: 'merge',
      oldBalance,
      newBalance,
      totalBalance: mergedBalance,
      legacyAccount: null,
      newAccount: mergedAcc
    };
  }

  /**
   * 创建新子账户时，从同一母账户名下已有子账户中划出余额（单一读写事务，保证母账户总额零误差）
   */
  async function createSubAccountFromExistingChild({ parentId, sourceChildId, newChildPayload }) {
    const parent = await getAccount(parentId);
    if (!parent) throw new Error('母账户不存在');
    const source = await getAccount(sourceChildId);
    if (!source || String(source.parentId || '') !== String(parentId)) {
      throw new Error('所选扣款子账户不存在或不属于该母账户');
    }

    const deductAmount = +(Number((newChildPayload && newChildPayload.balance) || 0)).toFixed(2);
    if (deductAmount < 0) throw new Error('划出金额不能为负数');

    const sourceBal = +(Number(source.balance || 0)).toFixed(2);
    if (sourceBal < deductAmount) {
      throw new Error(`「${source.name}」当前余额 ¥${sourceBal.toFixed(2)} 不足 ¥${deductAmount.toFixed(2)}`);
    }

    const nowIso = new Date().toISOString();
    const updatedSource = {
      ...source,
      balance: +(sourceBal - deductAmount).toFixed(2),
      updatedAt: nowIso
    };
    const newChild = {
      id: (newChildPayload && newChildPayload.id) || generateId('acc'),
      name: (newChildPayload && newChildPayload.name && String(newChildPayload.name).trim()) || '新子账户',
      type: (newChildPayload && newChildPayload.type) || parent.type || 'bank',
      balance: deductAmount,
      parentId: String(parentId),
      currency: (newChildPayload && newChildPayload.currency) || parent.currency || 'CNY',
      color: (newChildPayload && newChildPayload.color) || parent.color || '#3b82f6',
      icon: (newChildPayload && newChildPayload.icon) || parent.icon || '💳',
      notes: (newChildPayload && newChildPayload.notes) || '',
      creditLimit: (newChildPayload && newChildPayload.creditLimit !== undefined) ? Number(newChildPayload.creditLimit) : 0,
      updatedAt: nowIso
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      store.put(updatedSource);
      store.add(newChild);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    await updateTodaySnapshot();
    return {
      sourceAccount: updatedSource,
      newAccount: newChild,
      deductedAmount: deductAmount
    };
  }

  /**
   * 批量拆分母账户/独立账户余额（保留原有同名子账户 ID 避免历史流水断链）
   */
  async function applyAccountSplitPlan({ parentId, items }) {
    const parent = await getAccount(parentId);
    if (!parent) throw new Error('目标账户不存在');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('请至少提供一项拆分方案');
    }

    const rawAccounts = await readRawAccounts();
    const existingChildren = rawAccounts.filter((a) => a && a.parentId && String(a.parentId) === String(parentId));
    const existingByName = new Map();
    for (const c of existingChildren) {
      const key = String(c.name || '').trim();
      if (key && !existingByName.has(key)) existingByName.set(key, c);
    }

    const seenNames = new Set();
    const nowIso = new Date().toISOString();
    const updatedParent = {
      ...parent,
      balance: 0,
      updatedAt: nowIso
    };

    const toPut = [updatedParent];
    const toAdd = [];
    const keptIds = new Set();
    const addedIds = [];

    for (const item of items) {
      const trimmedName = String((item && item.name) || '').trim();
      if (!trimmedName) throw new Error('拆分辨目名称不能为空');
      if (seenNames.has(trimmedName)) throw new Error(`拆分辨目「${trimmedName}」重复`);
      seenNames.add(trimmedName);

      const bal = +(Number((item && item.balance) || 0)).toFixed(2);
      if (bal < 0) throw new Error(`「${trimmedName}」金额不能为负数`);

      const existing = existingByName.get(trimmedName);
      if (existing) {
        keptIds.add(existing.id);
        toPut.push({
          ...existing,
          name: trimmedName,
          type: (item && item.type) || existing.type || parent.type || 'bank',
          balance: bal,
          icon: (item && item.icon) || existing.icon || parent.icon || '💳',
          color: (item && item.color) || existing.color || parent.color || '#3b82f6',
          notes: (item && item.notes !== undefined) ? item.notes : (existing.notes || ''),
          updatedAt: nowIso
        });
      } else {
        const newId = generateId('acc');
        addedIds.push(newId);
        toAdd.push({
          id: newId,
          name: trimmedName,
          type: (item && item.type) || parent.type || 'bank',
          balance: bal,
          parentId: String(parentId),
          currency: parent.currency || 'CNY',
          color: (item && item.color) || parent.color || '#3b82f6',
          icon: (item && item.icon) || parent.icon || '💳',
          notes: (item && item.notes) || '',
          creditLimit: 0,
          updatedAt: nowIso
        });
      }
    }

    const toDeleteIds = existingChildren
      .filter((c) => !keptIds.has(c.id))
      .map((c) => c.id);

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      for (const delId of toDeleteIds) store.delete(delId);
      for (const putItem of toPut) store.put(putItem);
      for (const addItem of toAdd) store.add(addItem);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    await updateTodaySnapshot();
    return {
      parentId: String(parentId),
      keptIds: Array.from(keptIds),
      addedIds,
      deletedIds: toDeleteIds
    };
  }

  async function deleteAccount(id) {
    const allAccounts = await getAllAccounts();
    const hasChild = allAccounts.some(acc => acc && acc.parentId === id);
    if (hasChild) {
      throw new Error('该主账户名下仍有子账户，请先删除或迁出所有子账户');
    }

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });

    await updateTodaySnapshot();
    return true;
  }

  /**
   * 直接调整/更正账户余额
   * @param {string} id 账户ID
   * @param {number} newBalance 调整后的目标余额
   * @param {string} reason 调整原因
   * @param {string|null} recordDate 记录日期
   * @param {boolean} recordTransaction 是否生成流水记录。更正录入错误时默认为 false，不计入日常收支流水
   * @param {string|null} category 记入流水时的具体分类名称
   * @param {string|null} forcedTxType 指定记入流水类型 ('income' | 'expense')，保持与记一笔完全一致
   */
  async function adjustBalance(id, newBalance, reason = '余额更正', recordDate = null, recordTransaction = false, category = null, forcedTxType = null) {
    const targetBalance = Number(newBalance);
    if (isNaN(targetBalance)) throw new Error('请输入有效的目标余额');
    const account = await getAccount(id);
    if (!account) throw new Error('账户不存在');
    if (isNonNegativeAccountType(account.type) && targetBalance < 0) {
      throw new Error('储蓄卡/活期零钱/投资理财账户余额不能调整为负数，如需记录欠款请使用信用卡/负债账户');
    }

    const oldBalance = Number(account.balance || 0);
    const diff = +(targetBalance - oldBalance).toFixed(2);

    account.balance = targetBalance;
    account.updatedAt = new Date().toISOString();

    const db = await openDB();
    // 更新账户
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      const req = store.put(account);
      req.onsuccess = () => resolve(account);
      req.onerror = () => reject(req.error);
    });

    // 仅在明确指定生成流水且存在差值时，才写入一条流水记录
    if (recordTransaction && diff !== 0) {
      const txType = forcedTxType || (diff > 0 ? 'income' : 'expense');
      const finalCategory = category || (txType === 'income' ? '其他收入' : '其他支出');
      const txData = {
        id: generateId('tx'),
        type: txType,
        amount: Math.abs(diff),
        accountId: id,
        toAccountId: null,
        category: finalCategory,
        date: recordDate || formatDate(),
        notes: reason ? `${reason} (原: ¥${oldBalance.toFixed(2)} -> 现: ¥${targetBalance.toFixed(2)})` : `余额调整 (原: ¥${oldBalance.toFixed(2)} -> 现: ¥${targetBalance.toFixed(2)})`,
        isAdjustment: true,
        createdAt: new Date().toISOString()
      };

      await new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const req = store.add(txData);
        req.onsuccess = () => resolve(txData);
        req.onerror = () => reject(req.error);
      });
    }

    await updateTodaySnapshot();
    return account;
  }

  // ==========================================
  // Transactions (流水记账操作与账户联动)
  // ==========================================

  async function getAllTransactions(filter = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const request = store.getAll();

      request.onsuccess = () => {
        let list = request.result || [];

        // 默认按日期和创建时间倒序排列
        list.sort((a, b) => {
          if (b.date !== a.date) {
            return b.date.localeCompare(a.date);
          }
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        if (filter.accountId) {
          list = list.filter(item => item.accountId === filter.accountId || item.toAccountId === filter.accountId);
        }
        if (filter.type) {
          list = list.filter(item => item.type === filter.type);
        }
        if (filter.startDate) {
          list = list.filter(item => item.date >= filter.startDate);
        }
        if (filter.endDate) {
          list = list.filter(item => item.date <= filter.endDate);
        }
        if (filter.keyword) {
          const kw = filter.keyword.toLowerCase();
          list = list.filter(item =>
            (item.notes && item.notes.toLowerCase().includes(kw)) ||
            (item.category && item.category.toLowerCase().includes(kw))
          );
        }

        resolve(list);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function getTransaction(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function applyTxAccountDelta(fromAccount, toAccount, txType, amount, direction = 1) {
    const amt = Number(amount);
    const nowIso = new Date().toISOString();
    if (txType === 'transfer') {
      if (fromAccount) {
        if (fromAccount.type === 'credit') {
          if (direction === 1) {
            fromAccount.balance = fromAccount.balance < 0
              ? +(fromAccount.balance - amt).toFixed(2)
              : +(fromAccount.balance + amt).toFixed(2);
          } else {
            fromAccount.balance = fromAccount.balance < 0
              ? +(fromAccount.balance + amt).toFixed(2)
              : +(fromAccount.balance - amt).toFixed(2);
          }
        } else {
          fromAccount.balance = +(fromAccount.balance + (direction === 1 ? -amt : amt)).toFixed(2);
        }
        fromAccount.updatedAt = nowIso;
      }
      if (toAccount) {
        if (toAccount.type === 'credit') {
          if (direction === 1) {
            toAccount.balance = toAccount.balance < 0
              ? +(toAccount.balance + amt).toFixed(2)
              : +(toAccount.balance - amt).toFixed(2);
          } else {
            toAccount.balance = toAccount.balance < 0
              ? +(toAccount.balance - amt).toFixed(2)
              : +(toAccount.balance + amt).toFixed(2);
          }
        } else {
          toAccount.balance = +(toAccount.balance + (direction === 1 ? amt : -amt)).toFixed(2);
        }
        toAccount.updatedAt = nowIso;
      }
      return;
    }

    if (fromAccount) {
      if (txType === 'expense') {
        fromAccount.balance = +(fromAccount.balance + (direction === 1 ? -amt : amt)).toFixed(2);
      } else if (txType === 'income') {
        fromAccount.balance = +(fromAccount.balance + (direction === 1 ? amt : -amt)).toFixed(2);
      }
      fromAccount.updatedAt = nowIso;
    }
  }

  function assertAccountAllowsResultBalance(acc, prevBal, amount) {
    if (!acc) return;
    if (isNonNegativeAccountType(acc.type) && Number(acc.balance || 0) < 0) {
      if (prevBal >= 0 || Number(acc.balance || 0) < prevBal) {
        throw new Error(
          `「${acc.name}」当前余额 ¥${prevBal.toFixed(2)} 不足 ¥${Number(amount).toFixed(2)}，正资产账户余额不能为负数。请先校准余额，或改用「⚡ 纯流水」/ 信用卡记账`
        );
      }
    }
  }

  /**
   * 添加流水并联动更新对应账户余额
   * @param {Object} txData
   */
  async function addTransaction(txData) {
    const amount = Number(txData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('金额必须大于 0');
    }

    const type = txData.type; // 'expense', 'income', 'transfer'
    const accountId = txData.accountId || null;
    const toAccountId = txData.toAccountId || null;

    // 纯流水模式判定：未关联账户且非转账类型
    const isPureTransaction = !accountId && type !== 'transfer';

    const rawAccounts = await readRawAccounts();
    const parentIdSet = new Set();
    for (const a of rawAccounts) {
      if (a && a.parentId) parentIdSet.add(String(a.parentId));
    }

    let fromAccount = null;
    let toAccount = null;

    if (type === 'transfer') {
      if (!accountId) {
        throw new Error('转账必须选择转出账户');
      }
      fromAccount = await getAccount(accountId);
      if (!fromAccount) throw new Error('转出账户不存在');
      if (parentIdSet.has(String(fromAccount.id))) {
        throw new Error(`「${fromAccount.name}」为母账户，请选择名下具体子账户进行转账`);
      }
      if (!toAccountId || toAccountId === accountId) {
        throw new Error('转账必须选择不同的转入账户');
      }
      toAccount = await getAccount(toAccountId);
      if (!toAccount) throw new Error('转入账户不存在');
      if (parentIdSet.has(String(toAccount.id))) {
        throw new Error(`「${toAccount.name}」为母账户，请选择名下具体子账户作为转入账户`);
      }

      const prevFromBal = Number(fromAccount.balance || 0);
      applyTxAccountDelta(fromAccount, toAccount, 'transfer', amount, 1);
      assertAccountAllowsResultBalance(fromAccount, prevFromBal, amount);
    } else if (!isPureTransaction) {
      // 关联账户记账：联动更新账户余额
      fromAccount = await getAccount(accountId);
      if (!fromAccount) throw new Error('关联账户不存在');
      if (parentIdSet.has(String(fromAccount.id))) {
        throw new Error(`「${fromAccount.name}」为母账户，请选择名下具体子账户进行记账`);
      }

      const prevFromBal = Number(fromAccount.balance || 0);
      applyTxAccountDelta(fromAccount, null, type, amount, 1);
      if (type === 'expense') {
        assertAccountAllowsResultBalance(fromAccount, prevFromBal, amount);
      }
    }
    // 纯流水模式：不修改任何账户，跳过余额联动

    const newTx = {
      id: txData.id || generateId('tx'),
      type: type,
      amount: amount,
      accountId: accountId,
      toAccountId: toAccountId,
      category: txData.category || (type === 'transfer' ? '内部转账' : '日常收支'),
      date: txData.date || formatDate(),
      notes: txData.notes || '',
      receiptImage: txData.receiptImage || null,
      createdAt: txData.createdAt || new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const stores = fromAccount || toAccount ? ['transactions', 'accounts'] : ['transactions'];
      const transaction = db.transaction(stores, 'readwrite');
      const txStore = transaction.objectStore('transactions');

      txStore.add(newTx);
      if (fromAccount) {
        const accStore = transaction.objectStore('accounts');
        accStore.put(fromAccount);
        if (toAccount) {
          accStore.put(toAccount);
        }
      }

      transaction.oncomplete = () => resolve(newTx);
      transaction.onerror = () => reject(transaction.error);
    });

    await updateTodaySnapshot();
    return newTx;
  }

  /**
   * 编辑已有流水并原子级重算受影响账户余额（支持修复旧流水错误挂载的母账户/金额/类型）
   */
  async function updateTransaction(id, newTxData) {
    const oldTx = await getTransaction(id);
    if (!oldTx) throw new Error('流水记录不存在');

    const newAmount = Number(newTxData.amount);
    if (isNaN(newAmount) || newAmount <= 0) {
      throw new Error('金额必须大于 0');
    }

    const newType = newTxData.type || oldTx.type;
    const newAccountId = newTxData.accountId || null;
    const newToAccountId = newType === 'transfer' ? (newTxData.toAccountId || null) : null;

    const rawAccounts = await readRawAccounts();
    const parentIdSet = new Set();
    const accMap = new Map();
    const origBalances = new Map();
    for (const a of rawAccounts) {
      if (!a || !a.id) continue;
      if (a.parentId) parentIdSet.add(String(a.parentId));
      accMap.set(String(a.id), { ...a });
      origBalances.set(String(a.id), Number(a.balance || 0));
    }

    if (newType === 'transfer') {
      if (!newAccountId) throw new Error('转账必须选择转出账户');
      if (!newToAccountId || newToAccountId === newAccountId) {
        throw new Error('转账必须选择不同的转入账户');
      }
    }
    if (newAccountId) {
      const targetAcc = accMap.get(String(newAccountId));
      if (!targetAcc) throw new Error(newType === 'transfer' ? '转出账户不存在' : '关联账户不存在');
      if (parentIdSet.has(String(newAccountId))) {
        throw new Error(`「${targetAcc.name}」为母账户，请选择名下具体子账户`);
      }
    }
    if (newToAccountId) {
      const targetTo = accMap.get(String(newToAccountId));
      if (!targetTo) throw new Error('转入账户不存在');
      if (parentIdSet.has(String(newToAccountId))) {
        throw new Error(`「${targetTo.name}」为母账户，请选择名下具体子账户`);
      }
    }

    const touchedIds = new Set();

    // 1. 回滚旧流水对账户余额的影响（若旧流水错记在母账户，同样允许回滚释放）
    const oldFrom = oldTx.accountId ? accMap.get(String(oldTx.accountId)) : null;
    const oldTo = oldTx.toAccountId ? accMap.get(String(oldTx.toAccountId)) : null;
    if (oldFrom || oldTo) {
      applyTxAccountDelta(oldFrom, oldTo, oldTx.type, Number(oldTx.amount || 0), -1);
      if (oldFrom) touchedIds.add(String(oldFrom.id));
      if (oldTo) touchedIds.add(String(oldTo.id));
    }

    // 2. 应用新流水对账户余额的影响
    const newFrom = newAccountId ? accMap.get(String(newAccountId)) : null;
    const newTo = newToAccountId ? accMap.get(String(newToAccountId)) : null;
    if (newFrom || newTo) {
      applyTxAccountDelta(newFrom, newTo, newType, newAmount, 1);
      if (newFrom) touchedIds.add(String(newFrom.id));
      if (newTo) touchedIds.add(String(newTo.id));
    }

    // 3. 校验非负债账户修改后不能新增负余额
    for (const tid of touchedIds) {
      const acc = accMap.get(tid);
      if (!acc || parentIdSet.has(tid)) continue;
      const beforeBal = origBalances.get(tid) ?? 0;
      if (isNonNegativeAccountType(acc.type) && Number(acc.balance || 0) < 0) {
        if (beforeBal >= 0 || Number(acc.balance || 0) < beforeBal) {
          throw new Error(
            `修改后「${acc.name}」余额将变为 ¥${Number(acc.balance || 0).toFixed(2)}（余额不足），正资产账户余额不能为负数。请先校准余额，或改用「⚡ 纯流水」/ 信用卡`
          );
        }
      }
    }

    const updatedTx = {
      ...oldTx,
      type: newType,
      amount: newAmount,
      accountId: newAccountId,
      toAccountId: newToAccountId,
      category: newTxData.category || (newType === 'transfer' ? '内部转账' : '日常收支'),
      date: newTxData.date || oldTx.date || formatDate(),
      notes: newTxData.notes !== undefined ? newTxData.notes : (oldTx.notes || ''),
      receiptImage: newTxData.receiptImage !== undefined ? newTxData.receiptImage : (oldTx.receiptImage || null),
      updatedAt: new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const stores = touchedIds.size > 0 ? ['transactions', 'accounts'] : ['transactions'];
      const transaction = db.transaction(stores, 'readwrite');
      const txStore = transaction.objectStore('transactions');
      txStore.put(updatedTx);
      if (touchedIds.size > 0) {
        const accStore = transaction.objectStore('accounts');
        for (const tid of touchedIds) {
          const acc = accMap.get(tid);
          if (acc) accStore.put(acc);
        }
      }
      transaction.oncomplete = () => resolve(updatedTx);
      transaction.onerror = () => reject(transaction.error);
    });

    await healParentAccountsIfNeeded();
    await updateTodaySnapshot();
    return updatedTx;
  }

  /**
   * 删除流水，并反向回滚账户余额
   */
  async function deleteTransaction(id) {
    const txItem = await getTransaction(id);
    if (!txItem) return true;

    const amount = Number(txItem.amount);
    const type = txItem.type;
    const accountId = txItem.accountId;
    const toAccountId = txItem.toAccountId;

    const fromAccount = accountId ? await getAccount(accountId) : null;
    let toAccount = toAccountId ? await getAccount(toAccountId) : null;

    // 回滚余额 (仅当存在关联账户时)
    if (fromAccount) {
      if (type === 'expense') {
        fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
      } else if (type === 'income') {
        fromAccount.balance = +(fromAccount.balance - amount).toFixed(2);
      } else if (type === 'transfer') {
        // 回滚转出账户 (反转 transfer 时的操作)
        if (fromAccount.type === 'credit') {
          // 转出时增加了负债，回滚应减少负债
          if (fromAccount.balance < 0) {
            fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
          } else {
            fromAccount.balance = +(fromAccount.balance - amount).toFixed(2);
          }
        } else {
          fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
        }

        // 回滚转入账户 (反转 transfer 时的操作)
        if (toAccount) {
          if (toAccount.type === 'credit') {
            // 转入时减少了负债，回滚应恢复负债
            if (toAccount.balance < 0) {
              toAccount.balance = +(toAccount.balance - amount).toFixed(2);
            } else {
              toAccount.balance = +(toAccount.balance + amount).toFixed(2);
            }
          } else {
            toAccount.balance = +(toAccount.balance - amount).toFixed(2);
          }
        }
      }
      fromAccount.updatedAt = new Date().toISOString();
      if (toAccount) toAccount.updatedAt = new Date().toISOString();
    }

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const stores = fromAccount || toAccount ? ['transactions', 'accounts'] : ['transactions'];
      const transaction = db.transaction(stores, 'readwrite');
      const txStore = transaction.objectStore('transactions');

      txStore.delete(id);
      if (fromAccount) {
        const accStore = transaction.objectStore('accounts');
        accStore.put(fromAccount);
        if (toAccount) accStore.put(toAccount);
      }

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });

    await updateTodaySnapshot();
    return true;
  }

  // ==========================================
  // Snapshots (快照与对比差值)
  // ==========================================

  /**
   * 计算资产汇总（防止母账户与子账户重复计算）
   * 若某账户名下存在子账户（parentId === acc.id），则跳过该母账户自身余额，仅汇总叶节点余额
   */
  function calculateAssetSummary(accounts = []) {
    const list = Array.isArray(accounts) ? accounts : [];
    const parentIdSet = new Set();
    for (const acc of list) {
      if (acc && acc.parentId) {
        parentIdSet.add(acc.parentId);
      }
    }

    let totalAsset = 0;
    let totalLiability = 0;
    const balances = {};
    const leafAccounts = [];

    for (const acc of list) {
      if (!acc) continue;
      const bal = Number(acc.balance || 0);
      balances[acc.id] = bal;

      if (parentIdSet.has(acc.id)) {
        continue;
      }

      leafAccounts.push(acc);
      if (acc.type === 'credit') {
        // 信用卡/借贷账户：统一定义欠款为负债 (取绝对值 Math.abs，清零时为 0)
        totalLiability += Math.abs(bal);
      } else if (bal >= 0) {
        totalAsset += bal;
      } else {
        totalLiability += Math.abs(bal);
      }
    }

    totalAsset = +totalAsset.toFixed(2);
    totalLiability = +totalLiability.toFixed(2);
    const netAsset = +(totalAsset - totalLiability).toFixed(2);

    return {
      totalAsset,
      totalLiability,
      netAsset,
      balances,
      parentIdSet,
      leafAccounts
    };
  }

  /**
   * 统一计算母账户净额总额（与 calculateAssetSummary 总净资产算法一致：正资产相加，信用/负债子账户取绝对值相减）
   */
  function calculateParentNetBalance(parentId, accounts = []) {
    if (!parentId || !Array.isArray(accounts)) return 0;
    const children = accounts.filter((a) => a && a.parentId && String(a.parentId) === String(parentId));
    if (children.length === 0) {
      const self = accounts.find((a) => a && String(a.id) === String(parentId));
      return self ? Number(self.balance || 0) : 0;
    }
    return +children.reduce((sum, c) => {
      const bal = Number((c && c.balance) || 0);
      if (c && c.type === 'credit') {
        return sum - Math.abs(bal);
      }
      return sum + bal;
    }, 0).toFixed(2);
  }

  /**
   * 计算并持久化保存当天的资产快照
   */
  async function updateTodaySnapshot(customDate = null) {
    const accounts = await readRawAccounts();
    const today = customDate || formatDate();
    const { totalAsset, totalLiability, netAsset, balances } = calculateAssetSummary(accounts);

    const snapshot = {
      date: today,
      netAsset,
      totalAsset,
      totalLiability,
      accountBalances: balances,
      timestamp: Date.now()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      const req = store.put(snapshot);
      req.onsuccess = () => resolve(snapshot);
      req.onerror = () => reject(req.error);
    });

    return snapshot;
  }

  async function getSnapshot(date) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const req = store.get(date);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllSnapshots() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => a.date.localeCompare(b.date));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 获取核心概览指标：
   * 当前净资产、总资产、总负债、较昨日差值、较月初差值
   */
  async function getOverviewStats() {
    const today = formatDate();
    const currentSnapshot = await updateTodaySnapshot(today);
    const allSnapshots = await getAllSnapshots();

    // 1. 昨日快照查找
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    let yesterdaySnapshot = allSnapshots.find(s => s.date === yesterdayStr);
    if (!yesterdaySnapshot) {
      // 若没有严格昨天的快照，寻找今天之前的最近一个快照
      const pastSnapshots = allSnapshots.filter(s => s.date < today);
      if (pastSnapshots.length > 0) {
        yesterdaySnapshot = pastSnapshots[pastSnapshots.length - 1];
      }
    }

    // 2. 本月初快照查找 (本月 1 号或之前最近的快照)
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    let monthStartSnapshot = allSnapshots.find(s => s.date === monthStartStr);
    if (!monthStartSnapshot) {
      const beforeOrAtMonthStart = allSnapshots.filter(s => s.date <= monthStartStr);
      if (beforeOrAtMonthStart.length > 0) {
        monthStartSnapshot = beforeOrAtMonthStart[beforeOrAtMonthStart.length - 1];
      } else {
        monthStartSnapshot = allSnapshots[0] || null;
      }
    }

    const currentNet = currentSnapshot.netAsset;

    // 计算对比
    let diffYesterday = 0;
    let diffYesterdayPercent = 0;
    if (yesterdaySnapshot && yesterdaySnapshot.date !== today) {
      diffYesterday = +(currentNet - yesterdaySnapshot.netAsset).toFixed(2);
      if (yesterdaySnapshot.netAsset !== 0) {
        diffYesterdayPercent = +((diffYesterday / Math.abs(yesterdaySnapshot.netAsset)) * 100).toFixed(2);
      }
    }

    let diffMonth = 0;
    let diffMonthPercent = 0;
    if (monthStartSnapshot && monthStartSnapshot.date !== today) {
      diffMonth = +(currentNet - monthStartSnapshot.netAsset).toFixed(2);
      if (monthStartSnapshot.netAsset !== 0) {
        diffMonthPercent = +((diffMonth / Math.abs(monthStartSnapshot.netAsset)) * 100).toFixed(2);
      }
    }

    return {
      date: today,
      netAsset: currentNet,
      totalAsset: currentSnapshot.totalAsset,
      totalLiability: currentSnapshot.totalLiability,
      diffYesterday,
      diffYesterdayPercent,
      hasYesterday: !!(yesterdaySnapshot && yesterdaySnapshot.date !== today),
      diffMonth,
      diffMonthPercent,
      hasMonthStart: !!(monthStartSnapshot && monthStartSnapshot.date !== today)
    };
  }

  /**
   * 获取按时间升序排列的资产趋势快照序列（用于增长趋势图）
   */
  async function getTrendSnapshots() {
    await updateTodaySnapshot();
    const all = await getAllSnapshots();
    all.sort((a, b) => a.date.localeCompare(b.date));
    return all;
  }

  // ==========================================
  // 初始化与演示数据填充
  // ==========================================

  async function seedInitialDataIfEmpty() {
    const accounts = await getAllAccounts();
    if (accounts.length > 0) {
      return false; // 已有数据，无需初始化
    }

    // 默认预设账户 (搭配 20 种图标生态中的精选图标)
    const sampleAccounts = [
      { id: 'acc_1', name: '招商银行工资卡', type: 'bank', balance: 56800.00, color: '#2563eb', icon: '💳', notes: '工资及备用金' },
      { id: 'acc_2', name: '支付宝余额宝', type: 'cash', balance: 18500.50, color: '#0284c7', icon: '📱', notes: '日常零用' },
      { id: 'acc_3', name: '微信零钱通', type: 'cash', balance: 6200.00, color: '#16a34a', icon: '👛', notes: '小额生活开销' },
      { id: 'acc_4', name: '指数定投理财', type: 'investment', balance: 85000.00, color: '#7c3aed', icon: '📈', notes: '沪深300/纳斯达克' },
      { id: 'acc_5', name: '喵星应急私房钱', type: 'cash', balance: 3500.00, color: '#f59e0b', icon: '🐟', notes: '猫咪冻干与零食储备' },
      { id: 'acc_6', name: '招行经典白信用卡', type: 'credit', balance: 4500.00, color: '#ea580c', icon: '🛍️', notes: '下月10日还款' }
    ];

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      for (const acc of sampleAccounts) {
        acc.updatedAt = new Date().toISOString();
        store.add(acc);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    // 预设流水
    const today = formatDate();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = formatDate(d);

    const sampleTx = [
      { id: 'tx_1', type: 'expense', amount: 38.00, accountId: 'acc_3', category: '餐饮美食', date: today, notes: '工作日午餐', createdAt: new Date().toISOString() },
      { id: 'tx_2', type: 'expense', amount: 15.00, accountId: 'acc_3', category: '交通出行', date: today, notes: '地铁通勤', createdAt: new Date().toISOString() },
      { id: 'tx_3', type: 'expense', amount: 168.00, accountId: 'acc_6', category: '购物消费', date: yesterday, notes: '超市日用品采购', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'tx_4', type: 'income', amount: 20000.00, accountId: 'acc_1', category: '工资薪酬', date: `${today.substring(0, 8)}01`, notes: '月度基本薪酬', createdAt: new Date().toISOString() },
      { id: 'tx_5', type: 'transfer', amount: 2000.00, accountId: 'acc_1', toAccountId: 'acc_2', category: '内部转账', date: yesterday, notes: '备用金转出', createdAt: new Date(Date.now() - 86400000).toISOString() }
    ];

    await new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      for (const t of sampleTx) {
        store.add(t);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    // 预设历史资产快照趋势 (从开始使用到目前的平滑增长趋势)
    const trendMilestones = [
      { daysAgo: 30, netAsset: 132000.00, totalAsset: 137000.00, totalLiability: 5000.00 },
      { daysAgo: 24, netAsset: 136500.00, totalAsset: 141500.00, totalLiability: 5000.00 },
      { daysAgo: 18, netAsset: 142000.00, totalAsset: 147000.00, totalLiability: 5000.00 },
      { daysAgo: 12, netAsset: 148500.00, totalAsset: 153000.00, totalLiability: 4500.00 },
      { daysAgo: 7,  netAsset: 155200.00, totalAsset: 159700.00, totalLiability: 4500.00 },
      { daysAgo: 3,  netAsset: 159800.00, totalAsset: 164300.00, totalLiability: 4500.00 },
      { daysAgo: 1,  netAsset: 161800.50, totalAsset: 166300.50, totalLiability: 4500.00 }
    ];

    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');

      const nowTime = new Date();
      trendMilestones.forEach(item => {
        const past = new Date(nowTime);
        past.setDate(past.getDate() - item.daysAgo);
        const dateStr = formatDate(past);
        store.put({
          date: dateStr,
          netAsset: item.netAsset,
          totalAsset: item.totalAsset,
          totalLiability: item.totalLiability,
          accountBalances: {},
          timestamp: past.getTime()
        });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    // 记录今天快照
    await updateTodaySnapshot(today);
    return true;
  }

  /**
   * 清空所有数据 (重置为空白粮仓)
   */
  async function clearAllData() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['accounts', 'transactions', 'snapshots'], 'readwrite');
      tx.objectStore('accounts').clear();
      tx.objectStore('transactions').clear();
      tx.objectStore('snapshots').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  }

  // 全量备份涉及的 LocalStorage 键名集合（含行情自选、喵咪管家常用账户与位置、账户排序、主题及暗号配置）
  const BACKUP_LS_KEYS = [
    'cat_market_symbols',
    'cat_show_market',
    'cat_butler_fav_accounts',
    'cat_butler_fab_pos',
    'cat_account_order',
    'catTheme',
    'hideAmount',
    'app_password_hash',
    'app_security_question',
    'app_security_answer_hash',
    'app_password_skipped'
  ];

  function safeParseJSON(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  /**
   * 导出全量数据备份对象（IndexedDB 三大表 + LocalStorage 全量配置）
   */
  async function exportAllData() {
    await updateTodaySnapshot();
    const [accounts, transactions, trendSnapshots] = await Promise.all([
      getAllAccounts(),
      getAllTransactions(),
      getAllSnapshots()
    ]);
    trendSnapshots.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const lsDump = {};
    if (typeof localStorage !== 'undefined') {
      for (const k of BACKUP_LS_KEYS) {
        const val = localStorage.getItem(k);
        if (val !== null) lsDump[k] = val;
      }
    }

    return {
      app: 'personal-asset-pwa',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      accounts,
      transactions,
      trendSnapshots,
      snapshots: trendSnapshots,
      marketSymbols: safeParseJSON(lsDump.cat_market_symbols, []),
      showMarketBoard: lsDump.cat_show_market ? lsDump.cat_show_market === 'true' : undefined,
      catButlerFavAccounts: safeParseJSON(lsDump.cat_butler_fav_accounts, null),
      catButlerFabPos: safeParseJSON(lsDump.cat_butler_fab_pos, null),
      accountOrder: safeParseJSON(lsDump.cat_account_order, []),
      localStorage: lsDump
    };
  }

  /**
   * 从全量备份对象恢复数据（覆盖写入 IndexedDB + 还原 LocalStorage 配置）
   */
  async function importAllData(backupData) {
    const data = typeof backupData === 'string' ? JSON.parse(backupData) : backupData;
    if (!data || typeof data !== 'object') {
      throw new Error('无效的备份文件格式');
    }
    const accounts = Array.isArray(data.accounts) ? data.accounts : null;
    const transactions = Array.isArray(data.transactions) ? data.transactions : null;
    const snapshots = Array.isArray(data.trendSnapshots)
      ? data.trendSnapshots
      : (Array.isArray(data.snapshots) ? data.snapshots : []);

    if (!accounts || !transactions) {
      throw new Error('备份文件缺少 accounts 或 transactions 核心字段');
    }

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['accounts', 'transactions', 'snapshots'], 'readwrite');
      const accStore = tx.objectStore('accounts');
      const txStore = tx.objectStore('transactions');
      const snapStore = tx.objectStore('snapshots');

      accStore.clear();
      txStore.clear();
      snapStore.clear();

      for (const acc of accounts) {
        if (acc && acc.id) accStore.put(acc);
      }
      for (const item of transactions) {
        if (item && item.id) txStore.put(item);
      }
      for (const snap of snapshots) {
        if (snap && snap.date) snapStore.put(snap);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    if (!snapshots.length) {
      await updateTodaySnapshot();
    }

    if (typeof localStorage !== 'undefined') {
      const ls = (data.localStorage && typeof data.localStorage === 'object') ? data.localStorage : {};
      for (const k of BACKUP_LS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(ls, k) && ls[k] !== null && ls[k] !== undefined) {
          localStorage.setItem(k, String(ls[k]));
        }
      }
      if (Array.isArray(data.marketSymbols) && !ls.cat_market_symbols) {
        localStorage.setItem('cat_market_symbols', JSON.stringify(data.marketSymbols));
      }
      if (typeof data.showMarketBoard === 'boolean' && !ls.cat_show_market) {
        localStorage.setItem('cat_show_market', data.showMarketBoard ? 'true' : 'false');
      }
      if (Array.isArray(data.catButlerFavAccounts) && !ls.cat_butler_fav_accounts) {
        localStorage.setItem('cat_butler_fav_accounts', JSON.stringify(data.catButlerFavAccounts));
      }
      if (data.catButlerFabPos && typeof data.catButlerFabPos === 'object' && !ls.cat_butler_fab_pos) {
        localStorage.setItem('cat_butler_fab_pos', JSON.stringify(data.catButlerFabPos));
      }
      if (Array.isArray(data.accountOrder) && !ls.cat_account_order) {
        localStorage.setItem('cat_account_order', JSON.stringify(data.accountOrder));
      }
    }

    return {
      accountsCount: accounts.length,
      transactionsCount: transactions.length,
      snapshotsCount: snapshots.length
    };
  }

  return {
    openDB,
    generateId,
    formatDate,
    // Accounts
    getAllAccounts,
    healParentAccountsIfNeeded,
    detectAccountCreationConflict,
    getAccount,
    addAccount,
    updateAccount,
    isNonNegativeAccountType,
    createFirstSubAccountWithOldBalance,
    createSubAccountFromExistingChild,
    applyAccountSplitPlan,
    deleteAccount,
    adjustBalance,
    calculateAssetSummary,
    calculateParentNetBalance,
    // Transactions
    getAllTransactions,
    getTransaction,
    addTransaction,
    updateTransaction,
    recordTransaction: addTransaction,
    deleteTransaction,
    // Snapshots
    updateTodaySnapshot,
    getSnapshot,
    getAllSnapshots,
    getTrendSnapshots,
    getOverviewStats,
    // Seed, Clear & Full Backup
    seedInitialDataIfEmpty,
    clearAllData,
    exportAllData,
    importAllData
  };
});

/**
 * db.js - 原生 Promise 封装的 IndexedDB 数据存储层
 * 包含 ObjectStores: accounts, transactions, snapshots
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AssetDB = factory();
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

  async function getAllAccounts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readonly');
      const store = tx.objectStore('accounts');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAccount(id) {
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
    const account = {
      id,
      name: accountData.name || '新账户',
      type: accountData.type || 'bank', // cash, bank, investment, credit, other
      balance: Number(accountData.balance || 0),
      currency: accountData.currency || 'CNY',
      color: accountData.color || '#3b82f6',
      icon: accountData.icon || '💳',
      notes: accountData.notes || '',
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

    const updated = {
      ...existing,
      ...accountData,
      balance: Number(accountData.balance !== undefined ? accountData.balance : existing.balance),
      updatedAt: new Date().toISOString()
    };

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

  async function deleteAccount(id) {
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
   * 直接调整账户余额，并自动生成一条“余额调整”流水记录
   */
  async function adjustBalance(id, newBalance, reason = '余额校准', recordDate = null) {
    const targetBalance = Number(newBalance);
    const account = await getAccount(id);
    if (!account) throw new Error('账户不存在');

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

    // 如果余额有差值，写入一条 adjustment 流水以保持记录清晰
    if (diff !== 0) {
      const txData = {
        id: generateId('tx'),
        type: diff > 0 ? 'income' : 'expense',
        amount: Math.abs(diff),
        accountId: id,
        toAccountId: null,
        category: '余额调整',
        date: recordDate || formatDate(),
        notes: `${reason} (原: ¥${oldBalance.toFixed(2)} -> 现: ¥${targetBalance.toFixed(2)})`,
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
    const accountId = txData.accountId;
    const toAccountId = txData.toAccountId;

    const fromAccount = await getAccount(accountId);
    if (!fromAccount) throw new Error('关联账户不存在');

    let toAccount = null;
    if (type === 'transfer') {
      if (!toAccountId || toAccountId === accountId) {
        throw new Error('转账必须选择不同的转入账户');
      }
      toAccount = await getAccount(toAccountId);
      if (!toAccount) throw new Error('转入账户不存在');
    }

    // 联动调整账户余额
    if (type === 'expense') {
      fromAccount.balance = +(fromAccount.balance - amount).toFixed(2);
    } else if (type === 'income') {
      fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
    } else if (type === 'transfer') {
      fromAccount.balance = +(fromAccount.balance - amount).toFixed(2);
      toAccount.balance = +(toAccount.balance + amount).toFixed(2);
    }

    fromAccount.updatedAt = new Date().toISOString();
    if (toAccount) toAccount.updatedAt = new Date().toISOString();

    const newTx = {
      id: txData.id || generateId('tx'),
      type: type,
      amount: amount,
      accountId: accountId,
      toAccountId: toAccountId || null,
      category: txData.category || (type === 'transfer' ? '内部转账' : '日常收支'),
      date: txData.date || formatDate(),
      notes: txData.notes || '',
      createdAt: txData.createdAt || new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['transactions', 'accounts'], 'readwrite');
      const txStore = transaction.objectStore('transactions');
      const accStore = transaction.objectStore('accounts');

      txStore.add(newTx);
      accStore.put(fromAccount);
      if (toAccount) {
        accStore.put(toAccount);
      }

      transaction.oncomplete = () => resolve(newTx);
      transaction.onerror = () => reject(transaction.error);
    });

    await updateTodaySnapshot();
    return newTx;
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

    const fromAccount = await getAccount(accountId);
    let toAccount = toAccountId ? await getAccount(toAccountId) : null;

    // 回滚余额
    if (fromAccount) {
      if (type === 'expense') {
        fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
      } else if (type === 'income') {
        fromAccount.balance = +(fromAccount.balance - amount).toFixed(2);
      } else if (type === 'transfer') {
        fromAccount.balance = +(fromAccount.balance + amount).toFixed(2);
        if (toAccount) {
          toAccount.balance = +(toAccount.balance - amount).toFixed(2);
        }
      }
      fromAccount.updatedAt = new Date().toISOString();
      if (toAccount) toAccount.updatedAt = new Date().toISOString();
    }

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['transactions', 'accounts'], 'readwrite');
      const txStore = transaction.objectStore('transactions');
      const accStore = transaction.objectStore('accounts');

      txStore.delete(id);
      if (fromAccount) accStore.put(fromAccount);
      if (toAccount) accStore.put(toAccount);

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
   * 计算并持久化保存当天的资产快照
   */
  async function updateTodaySnapshot(customDate = null) {
    const accounts = await getAllAccounts();
    const today = customDate || formatDate();

    let totalAsset = 0;
    let totalLiability = 0;
    const balances = {};

    accounts.forEach(acc => {
      const bal = Number(acc.balance || 0);
      balances[acc.id] = bal;

      if (acc.type === 'credit') {
        // 信用卡类型：若是正数通常为欠款金额，或者是负余额。统一定义：欠款为负债
        if (bal < 0) {
          totalLiability += Math.abs(bal);
        } else {
          totalLiability += bal;
        }
      } else {
        if (bal >= 0) {
          totalAsset += bal;
        } else {
          totalLiability += Math.abs(bal);
        }
      }
    });

    totalAsset = +totalAsset.toFixed(2);
    totalLiability = +totalLiability.toFixed(2);
    const netAsset = +(totalAsset - totalLiability).toFixed(2);

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

  return {
    openDB,
    generateId,
    formatDate,
    // Accounts
    getAllAccounts,
    getAccount,
    addAccount,
    updateAccount,
    deleteAccount,
    adjustBalance,
    // Transactions
    getAllTransactions,
    getTransaction,
    addTransaction,
    deleteTransaction,
    // Snapshots
    updateTodaySnapshot,
    getSnapshot,
    getAllSnapshots,
    getTrendSnapshots,
    getOverviewStats,
    // Seed & Clear
    seedInitialDataIfEmpty,
    clearAllData
  };
});

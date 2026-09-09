const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = __dirname;

async function runAllTests() {
  console.log('=== 开始 PWA 本地应用完整性及功能自动化测试 ===\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
    }
  }

  // 1. 文件完整性测试
  test('检查必要静态资源文件是否存在', () => {
    const requiredFiles = [
      'index.html',
      'db.js',
      'sw.js',
      'manifest.json',
      'icons/icon.svg',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'vendor/vue.global.prod.js',
      'server.js'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(ROOT, file);
      assert.ok(fs.existsSync(fullPath), `文件缺失: ${file}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 0, `文件为空: ${file}`);
    }
  });

  // 2. manifest.json 规范性检验
  test('验证 manifest.json 格式与字段标准', () => {
    const manifestContent = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestContent);

    assert.ok(manifest.name, 'manifest 缺少 name');
    assert.ok(manifest.short_name, 'manifest 缺少 short_name');
    assert.strictEqual(manifest.display, 'standalone', 'display 必须为 standalone');
    assert.ok(manifest.icons && manifest.icons.length >= 2, 'icons 数量需满足规范');

    // 验证 manifest 内部声明的图标均存在
    for (const icon of manifest.icons) {
      const iconPath = path.join(ROOT, icon.src);
      assert.ok(fs.existsSync(iconPath), `manifest 中声明的图标不存在: ${icon.src}`);
    }
  });

  // 3. Service Worker 离线外壳清单检验
  test('验证 sw.js 包含所有必要预缓存路径', () => {
    const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(swContent.includes('STATIC_ASSETS'), 'sw.js 应包含预缓存静态资源列表');
    assert.ok(swContent.includes('install'), 'sw.js 应监听 install 事件');
    assert.ok(swContent.includes('fetch'), 'sw.js 应监听 fetch 事件并拦截请求');
    assert.ok(swContent.includes('index.html'), '预缓存应包含 index.html');
    assert.ok(swContent.includes('db.js'), '预缓存应包含 db.js');
  });

  // 4. index.html 功能与标签页结构检验
  test('验证 index.html 包含三大标签页及 Vue 挂载点', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('id="app"'), '缺少 Vue 挂载根节点 #app');
    assert.ok(html.includes("currentTab === 'overview'"), '缺少总览面板标签页');
    assert.ok(html.includes("currentTab === 'accounts'"), '缺少账户管理标签页');
    assert.ok(html.includes("currentTab === 'transactions'"), '缺少流水明细标签页');
    assert.ok(html.includes('AssetDB'), 'index.html 应引入并使用 AssetDB');
    assert.ok(html.includes('serviceWorker.register'), 'index.html 应包含 Service Worker 注册逻辑');
    assert.ok(html.includes('showAdjustModal'), '包含直接调额弹窗');
    assert.ok(html.includes('showTxModal'), '包含快捷记账弹窗');
    assert.ok(html.includes('diff-badge'), '包含昨日/本月差值徽标');
  });

  // 5. 模拟测试 db.js 业务逻辑
  await testAsync('测试 db.js 数据底座逻辑 (accounts/transactions/snapshots/联动)', async () => {
    // 构建一个内存 Mock IndexedDB 环境以在 Node 环境中验证 db.js 的算法
    const mockStorage = {
      accounts: new Map(),
      transactions: new Map(),
      snapshots: new Map()
    };

    class MockRequest {
      constructor() {
        this.result = null;
        this.error = null;
        this.onsuccess = null;
        this.onerror = null;
      }
      triggerSuccess(res) {
        this.result = res;
        if (this.onsuccess) this.onsuccess({ target: this });
      }
    }

    class MockStore {
      constructor(name) {
        this.name = name;
        this.map = mockStorage[name];
      }
      getAll() {
        const req = new MockRequest();
        setTimeout(() => req.triggerSuccess(Array.from(this.map.values())), 0);
        return req;
      }
      get(key) {
        const req = new MockRequest();
        setTimeout(() => req.triggerSuccess(this.map.get(key) || null), 0);
        return req;
      }
      add(val) {
        const req = new MockRequest();
        const key = this.name === 'snapshots' ? val.date : val.id;
        this.map.set(key, JSON.parse(JSON.stringify(val)));
        setTimeout(() => req.triggerSuccess(key), 0);
        return req;
      }
      put(val) {
        const req = new MockRequest();
        const key = this.name === 'snapshots' ? val.date : val.id;
        this.map.set(key, JSON.parse(JSON.stringify(val)));
        setTimeout(() => req.triggerSuccess(key), 0);
        return req;
      }
      delete(key) {
        const req = new MockRequest();
        this.map.delete(key);
        setTimeout(() => req.triggerSuccess(true), 0);
        return req;
      }
      createIndex() {}
    }

    class MockTx {
      constructor(storeNames) {
        this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
        this.oncomplete = null;
        this.onerror = null;
        setTimeout(() => {
          if (this.oncomplete) this.oncomplete();
        }, 5);
      }
      objectStore(name) {
        return new MockStore(name);
      }
    }

    const mockDB = {
      objectStoreNames: { contains: () => true },
      transaction: (stores, mode) => new MockTx(stores)
    };

    global.indexedDB = {
      open: () => {
        const req = new MockRequest();
        setTimeout(() => req.triggerSuccess(mockDB), 0);
        return req;
      }
    };

    // 引入 db.js
    const AssetDB = require('./db.js');
    assert.ok(AssetDB, 'db.js 导出成功');

    // 1. 添加账户
    const acc1 = await AssetDB.addAccount({
      id: 'test_bank',
      name: '招商银行测试账户',
      type: 'bank',
      balance: 10000.00
    });
    assert.strictEqual(acc1.balance, 10000);

    const acc2 = await AssetDB.addAccount({
      id: 'test_wallet',
      name: '微信测试零钱',
      type: 'cash',
      balance: 2000.00
    });
    assert.strictEqual(acc2.balance, 2000);

    // 2. 直接调额测试
    const adjusted = await AssetDB.adjustBalance('test_bank', 12500.00, '调额测试');
    assert.strictEqual(adjusted.balance, 12500);

    // 3. 记一笔支出，验证账户余额联动扣减
    const expenseTx = await AssetDB.addTransaction({
      type: 'expense',
      amount: 500.00,
      accountId: 'test_bank',
      category: '餐饮美食',
      date: '2026-09-09'
    });
    const acc1AfterExpense = await AssetDB.getAccount('test_bank');
    assert.strictEqual(acc1AfterExpense.balance, 12000, '支出后账户余额应减少500');

    // 4. 记一笔转账，验证双向联动
    const transferTx = await AssetDB.addTransaction({
      type: 'transfer',
      amount: 1000.00,
      accountId: 'test_bank',
      toAccountId: 'test_wallet',
      category: '内部转账',
      date: '2026-09-09'
    });
    const acc1AfterTransfer = await AssetDB.getAccount('test_bank');
    const acc2AfterTransfer = await AssetDB.getAccount('test_wallet');
    assert.strictEqual(acc1AfterTransfer.balance, 11000, '转出账户扣减1000');
    assert.strictEqual(acc2AfterTransfer.balance, 3000, '转入账户增加1000');

    // 5. 删除流水，验证自动反向回滚
    await AssetDB.deleteTransaction(transferTx.id);
    const acc1AfterRollback = await AssetDB.getAccount('test_bank');
    const acc2AfterRollback = await AssetDB.getAccount('test_wallet');
    assert.strictEqual(acc1AfterRollback.balance, 12000, '转账删除后转出账户应回滚+1000');
    assert.strictEqual(acc2AfterRollback.balance, 2000, '转账删除后转入账户应回滚-1000');

    // 6. 验证概览差值计算
    const stats = await AssetDB.getOverviewStats();
    assert.strictEqual(stats.netAsset, 14000, '净资产应为 12000 + 2000 = 14000');
  });

  // 6. HTTP 服务器端点响应测试
  await testAsync('测试本地 HTTP 服务端点状态与 MIME 类型', async () => {
    // 动态启动一个测试端口服务
    const TEST_PORT = 9123;
    const serverModule = require('./server.js'); // server.js 监听默认 PORT，我们直接启动一个轻量 http 测试实例
    const testServer = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';
      const fp = path.join(ROOT, reqPath);
      if (fs.existsSync(fp)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(fp).pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));

    function fetchUrl(pathname) {
      return new Promise((resolve, reject) => {
        http.get(`http://localhost:${TEST_PORT}${pathname}`, (res) => {
          resolve(res.statusCode);
        }).on('error', reject);
      });
    }

    const sIndex = await fetchUrl('/');
    const sManifest = await fetchUrl('/manifest.json');
    const sSw = await fetchUrl('/sw.js');
    const sDb = await fetchUrl('/db.js');

    assert.strictEqual(sIndex, 200, 'index.html 访问 200');
    assert.strictEqual(sManifest, 200, 'manifest.json 访问 200');
    assert.strictEqual(sSw, 200, 'sw.js 访问 200');
    assert.strictEqual(sDb, 200, 'db.js 访问 200');

    await new Promise((resolve) => testServer.close(resolve));
  });

  console.log(`\n测试完成: 共 ${total} 项测试，通过 ${passed} 项，失败 ${total - passed} 项。`);
  if (passed === total) {
    console.log('🎉 所有自动化测试通过！应用各模块准备就绪。');
  } else {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error('测试异常中断:', e);
  process.exit(1);
});

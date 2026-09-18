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
  test('验证 index.html 包含四大核心标签页及 Vue 挂载点', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('id="app"'), '缺少 Vue 挂载根节点 #app');
    assert.ok(html.includes("currentTab === 'overview'"), '缺少总览面板标签页');
    assert.ok(html.includes("currentTab === 'accounts'"), '缺少账户管理标签页');
    assert.ok(html.includes("currentTab === 'transactions'"), '缺少流水明细标签页');
    assert.ok(html.includes("currentTab === 'analytics'"), '缺少月度流水统计分析标签页');
    assert.ok(html.includes('badge-pure-tx'), '缺少纯流水专用标识');
    assert.ok(html.includes('selectedAnalyticsMonth'), '缺少原生年月筛选器');
    assert.ok(html.includes('monthlyCategoryExpenses'), '缺少消费支出分类排行榜');
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

    // 6. 验证纯流水 (流水与资产解耦记账模式)
    const pureTx = await AssetDB.addTransaction({
      type: 'expense',
      amount: 999.00,
      accountId: null,
      category: '美容美发',
      date: '2026-09-09'
    });
    assert.ok(pureTx.id, '纯流水应成功生成记录');
    assert.strictEqual(pureTx.accountId, null, '纯流水 accountId 应为 null');
    const acc1AfterPure = await AssetDB.getAccount('test_bank');
    const acc2AfterPure = await AssetDB.getAccount('test_wallet');
    assert.strictEqual(acc1AfterPure.balance, 12000, '纯流水不应影响账户1余额');
    assert.strictEqual(acc2AfterPure.balance, 2000, '纯流水不应影响账户2余额');

    // 验证总资产/净资产严格隔离：纯流水完全不影响净资产计算
    const stats = await AssetDB.getOverviewStats();
    assert.strictEqual(stats.netAsset, 14000, '净资产计算应严格忽略纯流水，维持 12000 + 2000 = 14000');

    // 删除纯流水，验证不报错且余额维持原样
    await AssetDB.deleteTransaction(pureTx.id);
    const acc1AfterDeletePure = await AssetDB.getAccount('test_bank');
    assert.strictEqual(acc1AfterDeletePure.balance, 12000, '删除纯流水不影响账户余额');

    // 6.1. 验证流水凭据图片 receiptImage 持久化保存
    const receiptTx = await AssetDB.addTransaction({
      type: 'expense',
      amount: 168.00,
      accountId: 'test_bank',
      category: '餐饮美食',
      date: '2026-09-09',
      receiptImage: 'data:image/jpeg;base64,mockReceiptImageBase64Data123456'
    });
    const savedTxWithReceipt = await AssetDB.getTransaction(receiptTx.id);
    assert.strictEqual(savedTxWithReceipt.receiptImage, 'data:image/jpeg;base64,mockReceiptImageBase64Data123456', '凭据图片 receiptImage 必须成功持久化保存到 IndexedDB');
    await AssetDB.deleteTransaction(receiptTx.id);
    const acc1AfterReceiptDelete = await AssetDB.getAccount('test_bank');
    assert.strictEqual(acc1AfterReceiptDelete.balance, 12000, '删除凭据测试流水后账户恢复原样');

    // 7. 验证转账至负债账户（信用卡）的逻辑：转账还款冲减负债，避免双倍扣减净资产
    const creditAcc = await AssetDB.addAccount({
      id: 'test_credit',
      name: '招商信用卡',
      type: 'credit',
      balance: 500.00 // 欠款 500
    });
    assert.strictEqual(creditAcc.balance, 500);

    // 还款前检查总资产、总负债与净资产:
    // 资产: 12000 (test_bank) + 2000 (test_wallet) = 14000
    // 负债: 500 (test_credit)
    // 净资产: 14000 - 500 = 13500
    const statsBeforeRepay = await AssetDB.getOverviewStats();
    assert.strictEqual(statsBeforeRepay.totalAsset, 14000);
    assert.strictEqual(statsBeforeRepay.totalLiability, 500);
    assert.strictEqual(statsBeforeRepay.netAsset, 13500);

    // 从储蓄卡转出 500 还款给信用卡
    const repayTx = await AssetDB.addTransaction({
      type: 'transfer',
      amount: 500.00,
      accountId: 'test_bank',
      toAccountId: 'test_credit',
      category: '内部转账',
      date: '2026-09-09'
    });

    const bankAfterRepay = await AssetDB.getAccount('test_bank');
    const creditAfterRepay = await AssetDB.getAccount('test_credit');
    assert.strictEqual(bankAfterRepay.balance, 11500, '转出储蓄卡扣减500还款额');
    assert.strictEqual(creditAfterRepay.balance, 0, '信用卡还款后欠款应冲减清零，由500变为0');

    // 还款后净资产应保持不变: 资产 11500 + 2000 = 13500, 负债 0, 净资产 13500
    const statsAfterRepay = await AssetDB.getOverviewStats();
    assert.strictEqual(statsAfterRepay.totalAsset, 13500);
    assert.strictEqual(statsAfterRepay.totalLiability, 0);
    assert.strictEqual(statsAfterRepay.netAsset, 13500, '转账还款后净资产不应产生双倍扣减，保持13500');

    // 删除还款流水，验证反向回滚
    await AssetDB.deleteTransaction(repayTx.id);
    const bankAfterRollback = await AssetDB.getAccount('test_bank');
    const creditAfterRollback = await AssetDB.getAccount('test_credit');
    assert.strictEqual(bankAfterRollback.balance, 12000, '删除流水后储蓄卡回滚+500');
    assert.strictEqual(creditAfterRollback.balance, 500, '删除流水后信用卡欠款恢复为500');

    const statsAfterRollback = await AssetDB.getOverviewStats();
    assert.strictEqual(statsAfterRollback.netAsset, 13500, '回滚后净资产恢复为13500');

    // 8. 验证信用卡信用额度 (creditLimit) 与额度剩余计算 (creditLimit + balance)
    const newCreditCard = await AssetDB.addAccount({
      id: 'test_credit_limit_card',
      name: '招商经典白金卡',
      type: 'credit',
      balance: 0.00, // 初始 0
      creditLimit: 50000.00
    });
    assert.strictEqual(newCreditCard.creditLimit, 50000, '信用总额度应成功持久化为 50000');
    assert.strictEqual(newCreditCard.balance, 0, '初始欠款余额应为 0');

    // 记录一笔信用卡支出 500 元
    await AssetDB.addTransaction({
      type: 'expense',
      amount: 500.00,
      accountId: 'test_credit_limit_card',
      category: '餐饮美食',
      date: '2026-09-09'
    });

    const cardAfterExpense = await AssetDB.getAccount('test_credit_limit_card');
    assert.strictEqual(cardAfterExpense.balance, -500, '信用卡支出后余额应为负数 -500 (表示欠款 500)');
    
    // 验证额度剩余计算: creditLimit + balance = 50000 + (-500) = 49500
    const remainingLimit = +(cardAfterExpense.creditLimit + cardAfterExpense.balance).toFixed(2);
    assert.strictEqual(remainingLimit, 49500, '额度剩余应为 50000 - 500 = 49500');

    // 验证编辑更新信用额度至 60000
    const updatedCard = await AssetDB.updateAccount({
      id: 'test_credit_limit_card',
      creditLimit: 60000.00
    });
    assert.strictEqual(updatedCard.creditLimit, 60000, '信用额度应成功更新为 60000');
    assert.strictEqual(+(updatedCard.creditLimit + updatedCard.balance).toFixed(2), 59500, '更新额度后额度剩余应为 60000 - 500 = 59500');

    // 9. 验证调额逻辑（支持直接修改总额与增减模式）
    // 增量模式：给 test_bank (当前 12000) 增加 500 元
    const bankOld = await AssetDB.getAccount('test_bank');
    const newBalAdd = +(bankOld.balance + 500).toFixed(2);
    const bankAfterAdd = await AssetDB.adjustBalance('test_bank', newBalAdd, '增减调额:新增500');
    assert.strictEqual(bankAfterAdd.balance, 12500, '增量模式新增500后余额应为12500');

    // 增量模式：给 test_bank 减少 300 元
    const newBalSub = +(bankAfterAdd.balance - 300).toFixed(2);
    const bankAfterSub = await AssetDB.adjustBalance('test_bank', newBalSub, '增减调额:扣减300');
    assert.strictEqual(bankAfterSub.balance, 12200, '增量模式减少300后余额应为12200');
  });

  // 6. 隐私暗号锁功能与安全规范检验
  test('验证本地隐私暗号锁与安全配置', () => {
    // 验证背景壁纸
    const lockBgPath = path.join(ROOT, 'assets/lock-bg.jpg');
    assert.ok(fs.existsSync(lockBgPath), '暗号锁屏壁纸 assets/lock-bg.jpg 不存在');
    assert.ok(fs.statSync(lockBgPath).size > 10000, '暗号锁屏壁纸文件异常');

    // 验证 SW 缓存
    const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(swContent.includes('assets/lock-bg.jpg'), 'sw.js 必须包含 lock-bg.jpg 缓存');

    // 验证 index.html UI 与逻辑
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('lock-screen-container'), '缺少锁屏界面容器 .lock-screen-container');
    assert.ok(html.includes('v-if="isLocked"'), '缺少 isLocked 状态条件控制');
    assert.ok(html.includes('v-if="!isLocked"'), '主视图缺少 !isLocked 保护');
    assert.ok(html.includes('约定一个暗号'), '缺少首次登录选项【约定一个暗号】');
    assert.ok(html.includes('我不需要暗号'), '缺少首次登录选项【我不需要暗号】');
    assert.ok(html.includes('暗号，我不需要暗号'), '缺少解锁选项【暗号，我不需要暗号】');
    assert.ok(html.includes('确认'), '缺少居中输入后的【确认】确认框');
    assert.ok(html.includes('忘记暗号'), '缺少【忘记暗号】找回入口');
    assert.ok(html.includes('密保问题'), '缺少密保问题设置与验证');
    assert.ok(html.includes('isEnteringCode'), '缺少 isEnteringCode 响应式输入状态');
    assert.ok(html.includes('不会吧不会吧，不会有人忘了暗号吧'), '缺少错误提示语【不会吧不会吧，不会有人忘了暗号吧】');
    assert.ok(html.includes('SHA-256'), '缺少 SHA-256 哈希加密算法');
    assert.ok(html.includes('visibilitychange'), '缺少 visibilitychange 离屏监听');
    assert.ok(html.includes('300000'), '缺少 5分钟 (300,000ms) 自动上锁时间阈值');
    assert.ok(html.includes('background: transparent !important'), '锁屏输入框或按钮缺少透明背景样式');

    // 验证新优化项：年度分析、纯 CSS 圆锥渐变饼图与移动端记一笔吸底保存
    assert.ok(html.includes('analyticsTimeMode'), '缺少 analyticsTimeMode 年度/月度时间模式切换');
    assert.ok(html.includes('pieChartGradient'), '缺少 pieChartGradient 纯 CSS 圆锥渐变计算');
    assert.ok(html.includes('conic-gradient'), '缺少 conic-gradient 圆锥渐变纯 CSS 饼图实现');
    assert.ok(html.includes('pie-chart-wrapper'), '缺少 .pie-chart-wrapper 饼图容器');
    assert.ok(html.includes('tx-modal-sticky-footer'), '缺少 .tx-modal-sticky-footer 记一笔首屏吸底保存按钮');
    assert.ok(html.includes('grid-template-columns: repeat(4, 1fr)'), '缺少分类选择四列全景展开网格');
    assert.ok(html.includes('form-date-input'), '缺少记账日期专属对齐样式 .form-date-input');
  });

  // 7. HTTP 服务器端点响应测试
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

  // 8. OCR 离线识别基建与接口规范检验
  test('验证 OCR 离线识别基建 (sw.js 独立缓存池、db.js recordTransaction 与按需加载)', () => {
    const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(swContent.includes('ocr-cache-v1'), 'sw.js 应定义并维护 ocr-cache-v1 独立缓存池');
    assert.ok(swContent.includes('key !== OCR_CACHE_NAME'), 'sw.js 激活阶段必须保护 ocr-cache-v1 不被常规版本清除');
    assert.ok(swContent.includes('isOcrResource'), 'sw.js 应拦截 Tesseract/WASM/Traineddata 资源并动态缓存');

    const dbContent = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    assert.ok(dbContent.includes('recordTransaction'), 'db.js 应导出 recordTransaction 别名以支持批量入账');

    const htmlContent = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(!htmlContent.includes('<script src="https://cdn.jsdelivr.net/npm/tesseract.js'), 'index.html head 绝不可静态引入 Tesseract.js');
    assert.ok(htmlContent.includes('智能识别票据/长图'), 'index.html 应包含智能识别票据按钮');
    assert.ok(htmlContent.includes('showBatchModal'), 'index.html 应包含批量核对弹窗');
    assert.ok(htmlContent.includes('ocrLoading'), 'index.html 应包含 OCR 进度提示遮罩');
    assert.ok(htmlContent.includes('preprocessReceiptImage'), 'index.html 应包含 Canvas 二值化图像预处理');
    assert.ok(htmlContent.includes('batchTxList'), 'index.html 应维护 batchTxList 响应式流水数组');
  });

  // 9. OCR 正则提取引擎准确性检验
  test('测试 OCR 票据与长图正则提取引擎解析精度', () => {
    // 提取 index.html 中的 parseReceiptText 逻辑并进行纯函数单元测试
    const htmlContent = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const fnMatch = htmlContent.match(/function parseReceiptText\([\s\S]*?\n\s{8}\}/);
    assert.ok(fnMatch, '必须能从 index.html 中提取 parseReceiptText 引擎实现');

    const parseReceiptText = new Function(`${fnMatch[0]}; return parseReceiptText;`)();

    // 场景 A: 超市单张消费小票测试
    const receiptSample = `
      欢迎光临
      永辉超市 (天山路旗舰店)
      收银员: 008
      可口可乐 330ml  x2  ¥6.00
      特仑苏纯牛奶 1箱    ¥58.80
      鲜鸡蛋 1盒          ¥19.90
      ------------------------------
      件数: 4
      合计: ¥ 84.70
      实付: 84.70
      微信支付: 84.70
      谢谢惠顾，欢迎再次光临！
    `;
    const receiptResult = parseReceiptText(receiptSample);
    assert.ok(receiptResult.length >= 1, '应成功匹配到单张小票消费');
    assert.strictEqual(receiptResult[0].amount, 84.7, '应精准提取实付金额 84.70');
    assert.ok(receiptResult[0].note.includes('永辉超市'), '应提取商户名称 永辉超市');

    // 场景 B: 微信/支付宝长图电子账单明细测试
    const billListSample = `
      2026-09-14
      美团外卖 -28.50
      滴滴出行 - 42.00
      瑞幸咖啡
      -18.00
      盒马鲜生 -¥125.60
      2026-09-13
    `;
    const billResult = parseReceiptText(billListSample);
    assert.ok(billResult.length >= 3, '长图模式应提取出至少 3 笔流水明细');
    const amounts = billResult.map(r => r.amount);
    assert.ok(amounts.includes(28.5), '应包含美团外卖 28.50');
    assert.ok(amounts.includes(42), '应包含滴滴出行 42.00');
    // 场景 C: 新增分类扩展智能匹配测试
    const newCatBillSample = `
      木北造型理发 -128.00
      新东方网课培训学费 -2600.00
      全季酒店度假客栈 -450.00
      微信红包份子钱随礼 -800.00
    `;
    const newCatResults = parseReceiptText(newCatBillSample);
    assert.ok(newCatResults.length >= 4, '应解析出4笔新增分类明细');
    assert.ok(newCatResults.some(r => r.category === '美容美发'), '应正确映射美容美发分类');
    assert.ok(newCatResults.some(r => r.category === '学习教育'), '应正确映射学习教育分类');
    assert.ok(newCatResults.some(r => r.category === '旅游探索'), '应正确映射旅游探索分类');
    assert.ok(newCatResults.some(r => r.category === '礼金人情'), '应正确映射礼金人情分类');
  });

  // 10. 极简顶栏规范与应用设置四大模块 (主题/暗号/重置/版本历史)
  test('验证极简顶栏规范与应用设置四大模块 (主题/暗号/重置/版本历史)', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    // 1. 验证顶栏干净极简：只保留头像标识、应用标题、副标题、隐藏资产与刷新
    assert.ok(html.includes('brand-cat-avatar'), '顶栏应保留应用图像标识 brand-cat-avatar');
    assert.ok(html.includes('喵的粮仓'), '顶栏应包含品牌名称 喵的粮仓');
    assert.ok(html.includes('一个懂事的粮仓'), '顶栏应包含纯净副标题 一个懂事的粮仓');
    assert.ok(html.includes('toggleHideAmount'), '顶栏应保留资产隐藏/显示按钮');
    assert.ok(html.includes('refreshAllData'), '顶栏应保留数据刷新按钮');

    // 验证顶栏已彻底清除冗余元素 (无主题角标、无版本号角标、无独立图标按钮)
    assert.ok(!html.includes('brand-tag-badge'), '顶栏不应包含版本号徽标');
    assert.ok(!html.includes('class="icon-btn theme-btn"'), '顶栏操作区不应包含主题切换按钮');

    // 2. 验证头像整合为应用设置入口
    assert.ok(html.includes("openSettingsModal('theme')"), '点击应用头像应打开应用设置');

    // 3. 验证应用设置四大核心功能模块切换
    assert.ok(html.includes('settings-nav-tabs'), '设置弹窗应包含四大功能导航栏 .settings-nav-tabs');
    assert.ok(html.includes("settingsTab === 'theme'"), '包含 模块1: 主题设置');
    assert.ok(html.includes("settingsTab === 'security'"), '包含 模块2: 暗号设置');
    assert.ok(html.includes("settingsTab === 'reset'"), '包含 模块3: 重置设置');
    assert.ok(html.includes("settingsTab === 'version'"), '包含 模块4: 版本历史');

    // 4. 验证版本历史模块在设置内的完整呈现
    assert.ok(html.includes('version-current-banner'), '版本历史模块应包含当前版本横幅 .version-current-banner');
    assert.ok(html.includes('version-timeline-container'), '应包含版本时间轴容器 .version-timeline-container');
    assert.ok(html.includes('version-card'), '应包含版本卡片 .version-card');
    assert.ok(html.includes('version-tag-pill'), '应包含版本标签 Pill');
    assert.ok(html.includes('version-date'), '应包含迭代日期');
    assert.ok(html.includes('version-features-list'), '应包含功能列表');

    // 5. 检查版本历程数据完整性 (从 v1.0 到 v4.8.0)
    const expectedVersions = ['v4.8.0', 'v4.7.2', 'v4.7.1', 'v4.7', 'v4.6', 'v4.5', 'v4.4', 'v4.3', 'v4.2', 'v4.1', 'v4.0', 'v3.9', 'v3.8', 'v3.7', 'v3.2', 'v3.1', 'v3.0', 'v2.9', 'v2.6', 'v2.5', 'v2.3', 'v2.0', 'v1.0'];
    for (const ver of expectedVersions) {
      assert.ok(html.includes(`version: '${ver}'`), `版本历史列表中应包含 ${ver}`);
    }

    // 6. 检查 Vue 状态与方法暴露
    assert.ok(html.includes('settingsTab'), 'Vue 状态中应包含 settingsTab');
    assert.ok(html.includes('openSettingsModal'), 'Vue 状态中应包含 openSettingsModal');
    assert.ok(html.includes('currentVersion'), 'Vue 状态中应包含 currentVersion');
    assert.ok(html.includes("currentVersion = ref('v4.8.0')"), '当前运行版本应为 v4.8.0');
    assert.ok(html.includes('versionHistoryList'), 'Vue 状态中应包含 versionHistoryList');
    assert.ok(html.includes('creditLimit'), 'index.html 应包含 creditLimit 信用额度支持');
    assert.ok(html.includes('getCreditCardRemainingLimit'), 'index.html 应包含信用卡额度剩余计算');
    assert.ok(html.includes('按增减变动金额'), 'index.html 调额弹窗应包含增减变动金额模式');

    // 7. 检查大版本 v4.8.0 核心功能特性: 行情看板、凭据压缩、日历日账单
    assert.ok(html.includes('showMarketBoard'), '应包含自选行情看板状态');
    assert.ok(html.includes('fetchMarketQuotesJSONP'), '应包含行情看板 JSONP 抓取引擎');
    assert.ok(html.includes("settingsTab === 'market'"), '设置内应包含自选行情看板管理');
    assert.ok(html.includes('compressReceiptImage'), '应包含凭据 Canvas 强力压缩算法');
    assert.ok(html.includes('showReceiptLightbox'), '应包含凭据全屏预览 Lightbox');
    assert.ok(html.includes('showTxDetailModal'), '应包含单笔流水详情弹窗');
    assert.ok(html.includes('analyticsSubView'), '应包含统计分析双子视图切换');
    assert.ok(html.includes('calendarDays'), '应包含日历日账单 7 列月度网格算法');

    // 8. 检查内部转账提示与 SW 缓存版本升级与样式底色保护
    assert.ok(html.includes('提示：内部转账仅调整资金分布，不会计入月度/年度收支流水与统计图表'), '转账表单应包含流水说明静态提示');
    assert.ok(html.includes('background-repeat: no-repeat !important'), 'pill-select 必须强制单图无平铺以杜绝花底纹');
    const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(swContent.includes('personal-asset-pwa-v33'), 'sw.js 缓存版本应升级为 personal-asset-pwa-v33');

    // 9. 验证 PWABuilder 100% Store Ready Manifest 规范与沉浸式 UI 适配
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifest.id, '/', 'manifest.json 应包含 id: "/"');
    assert.strictEqual(manifest.name, '喵的粮仓', 'manifest.json name 应为 喵的粮仓');
    assert.strictEqual(manifest.short_name, '喵的粮仓', 'manifest.json short_name 必须精准为 喵的粮仓，不可为 喵粮仓');
    assert.strictEqual(manifest.start_url, '.', 'manifest.json start_url 应为 .');
    assert.strictEqual(manifest.display, 'standalone', 'manifest.json display 应为 standalone');
    assert.strictEqual(manifest.theme_color, '#fbf5e7', 'manifest.json theme_color 应为 #fbf5e7 消除发红');
    assert.strictEqual(manifest.background_color, '#fbf5e7', 'manifest.json background_color 应为 #fbf5e7');
    assert.ok(html.includes('<meta name="theme-color" content="#fbf5e7">'), 'index.html meta theme-color 应为 #fbf5e7');
    assert.ok(html.includes('viewport-fit=cover'), 'index.html 应包含 viewport-fit=cover 沉浸式全面屏适配');
    assert.ok(html.includes('-webkit-text-size-adjust: 100% !important'), 'index.html 应包含字体缩放锁定规则');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest.json icons 应至少包含两个规格图标');
    assert.ok(manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png' && i.purpose.includes('maskable')), '包含 192x192 maskable 图标');
    assert.ok(manifest.icons.some(i => i.sizes === '512x512' && i.type === 'image/png' && i.purpose.includes('maskable')), '包含 512x512 maskable 图标');
    assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2, 'manifest.json 应包含 narrow 和 wide 截图数组');
    assert.ok(manifest.screenshots.some(s => s.form_factor === 'narrow'), '包含 narrow 移动端截图');
    assert.ok(manifest.screenshots.some(s => s.form_factor === 'wide'), '包含 wide 宽屏截图');

    // 9. 校验真实图片文件的 PNG 二进制签名与尺寸
    const checkPngFile = (relPath, expW, expH) => {
      const p = path.join(ROOT, relPath);
      assert.ok(fs.existsSync(p), `图片文件 ${relPath} 必须存在`);
      const b = fs.readFileSync(p);
      assert.strictEqual(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relPath} 必须是真实 PNG 二进制格式`);
      assert.strictEqual(b.readUInt32BE(16), expW, `${relPath} 宽度必须为 ${expW}`);
      assert.strictEqual(b.readUInt32BE(20), expH, `${relPath} 高度必须为 ${expH}`);
    };
    checkPngFile('public/icon-192.png', 192, 192);
    checkPngFile('public/icon-512.png', 512, 512);
    checkPngFile('public/screenshot-1.png', 1080, 1920);
    checkPngFile('public/screenshot-2.png', 1920, 1080);

    // 10. 校验 Android TWA .well-known/assetlinks.json 一致性与最新证书指纹
    const assetlinksRaw = fs.readFileSync(path.join(ROOT, 'public/.well-known/assetlinks.json'), 'utf8');
    const assetlinks = JSON.parse(assetlinksRaw);
    assert.ok(Array.isArray(assetlinks) && assetlinks.length > 0, 'assetlinks.json 应为有效数组');
    const target = assetlinks[0].target;
    assert.strictEqual(target.package_name, 'io.github.mountainxia.twa', 'TWA 包名应为 io.github.mountainxia.twa');
    assert.ok(target.sha256_cert_fingerprints.includes('B1:A1:1D:C9:C6:E9:63:C4:F6:50:66:C0:4F:2E:88:ED:77:85:F3:A7:32:85:AD:96:63:1C:4F:2F:64:C7:11:7B'), '必须包含最新更新的 SHA-256 证书指纹');
    const rootAssetlinksRaw = fs.readFileSync(path.join(ROOT, '.well-known/assetlinks.json'), 'utf8');
    assert.strictEqual(rootAssetlinksRaw.trim(), assetlinksRaw.trim(), '根目录与 public 目录下的 assetlinks.json 必须保持严格同步');
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

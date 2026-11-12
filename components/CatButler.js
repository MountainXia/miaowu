/**
 * CatButler.js —「喵咪管家」全局智能对话记账组件（第一步：核心骨架与数据联动）
 *
 * 说明：本项目为「单页 index.html + Vue 3 全局构建版（无 Vite / 无 SFC 编译）」，
 * 因此组件以纯 JS 选项式对象 + 运行时模板形式封装，所有管家逻辑 / 正则解析 / UI / 样式
 * 均 100% 收敛在本文件内；index.html 仅负责：引入脚本、注册组件、挂载标签。
 *
 * 用法（index.html）：
 *   <cat-butler :accounts="accounts" :get-category-img="getCategoryImg"
 *               :get-category-emoji="getCategoryEmoji" :get-account-icon-img="getAccountIconImg"
 *               @saved="refreshAllData"></cat-butler>
 */
(function (global) {
  'use strict';

  // ==================== 一、分类结构与第一阶段占位字典 ====================
  const EXPENSE_CATEGORIES = [
    '餐饮美食', '交通出行', '购物消费', '休闲娱乐', '日用百货', '住房物业',
    '医疗保健', '美容美发', '学习教育', '家庭育儿', '车辆座驾', '电子设备',
    '投资理财', '数字资产', '礼金人情', '旅游探索', '其他支出'
  ];

  const INCOME_CATEGORIES = [
    '工资薪酬', '营业盈余', '投资理财', '数字资产', '兼职副业',
    '奖金分红', '礼金人情', '退款返回', '其他收入'
  ];

  const expenseKeywordMap = {
    '餐饮美食': ['餐饮', '吃', '面条', '早餐', '奶茶', '烧烤'],
    '交通出行': ['交通', '地铁', '公交', '打车', '机票', '高铁'],
    '购物消费': ['购物', '买', '淘宝', '衣服', '鞋子'],
    '休闲娱乐': ['娱乐', '电影', '游戏', '唱歌', '游泳'],
    '日用百货': ['日用', '纸巾', '洗衣液', '猫粮', '猫砂'],
    '住房物业': ['房租', '水电', '物业', '话费', '宽带'],
    '医疗保健': ['医疗', '买药', '感冒药', '看病', '体检'],
    '美容美发': ['理发', '剪发', '护肤', '化妆'],
    '学习教育': ['买书', '考试', '网课', '文具'],
    '家庭育儿': ['奶粉', '尿不湿', '玩具', '家用'],
    '车辆座驾': ['加油', '停车', '洗车', '保养', '过路费'],
    '电子设备': ['手机', '电脑', '耳机', '键盘', '充电宝'],
    '投资理财': ['买基金', '定投', '买股票', '买黄金'],
    '数字资产': ['云服务器', '买域名', '软件订阅', '会员充值'],
    '礼金人情': ['发红包', '随礼', '份子钱', '请客', '送礼'],
    '旅游探索': ['旅游', '酒店', '门票', '民宿', '签证'],
    '其他支出': ['其他', '杂费', '意外']
  };

  const incomeKeywordMap = {
    '工资薪酬': ['发工资', '工资', '薪水', '底薪', '加班费'],
    '营业盈余': ['营业盈余', '营业额', '项目回款', '尾款到账', '货款'],
    '投资理财': ['理财收益', '基金收益', '股票盈利', '止盈', '利息'],
    '数字资产': ['卖源码', '卖域名', '软件分成', '流量主'],
    '兼职副业': ['兼职', '副业', '外快', '私活', '稿费', '约拍'],
    '奖金分红': ['奖金', '年终奖', '绩效', '分红', '股息', '提成'],
    '礼金人情': ['收红包', '收到红包', '收礼金', '压岁钱收入'],
    '退款返回': ['退款', '退货', '报销', '退税', '返现', '理赔'],
    '其他收入': ['闲鱼卖出', '卖二手', '中奖', '其他收入']
  };

  // 分类名 -> 主应用图标映射别名（主应用中该分类图标键名为「退款返还」）
  const ICON_ALIAS = { '退款返回': '退款返还' };

  // ==================== 二、正则常量 ====================
  const INCOME_FEATURE_RE = /收到|收了|入账|到账|赚了|赚|盈利|止盈|分红|利息|退回|退款|退了|报销|返现|卖出|卖了|回血|中奖|发了|发工资/;
  const BRAND_NOISE_RE = /85度C|7-11|双11|双十一|(?<!\d)(?:711|618|520)(?!\d)/gi;
  const UNIT_NOISE_RE = /\d+(?:\.\d+)?\s*(?:个|只|碗|杯|份|瓶|包|袋|斤|两|次|趟|路|号线|折|度C|天|月|日|号|年)/gi;
  const SPLIT_RE = /[，。、；;,\n\r]+/;
  const MULTI_RE = /([^\d\s]+)\s*(\d+(?:\.\d{1,2})?\s*(?:元|块钱|块|毛|角)?)/g;
  const UNIT_AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(块钱|元|块|毛|角)/g;
  const PLAIN_NUM_RE = /\d+(?:\.\d+)?/g;

  const ACCOUNT_ALIAS_GROUPS = [
    ['农行', '农业银行'], ['工行', '工商银行'], ['建行', '建设银行'], ['招行', '招商银行'],
    ['中行', '中国银行'], ['交行', '交通银行'], ['邮储', '邮政'],
    ['微信'], ['支付宝'], ['花呗'], ['信用卡']
  ];

  // ==================== 三、工具函数 ====================
  const toFull = (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xFEE0));
  const toHalf = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));

  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function buildMonthDay(month, day, today) {
    const m = Number(month), d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    let dt = new Date(today.getFullYear(), m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    if (dt > today) dt = new Date(today.getFullYear() - 1, m - 1, d); // 未来日期视为去年
    return fmtDate(dt);
  }

  /** 从文本中提取日期，返回 { text: 去除日期词后的文本, date: 'YYYY-MM-DD' | null } */
  function extractDate(text, today) {
    let t = text;
    let date = null;
    const rel = [[/大前天/, -3], [/前天/, -2], [/昨天|昨日/, -1], [/今天|今日/, 0]];
    for (const [re, offset] of rel) {
      if (re.test(t)) {
        const d = new Date(today);
        d.setDate(d.getDate() + offset);
        date = fmtDate(d);
        t = t.replace(re, ' ');
        break;
      }
    }
    if (!date) {
      const patterns = [
        { re: /(\d{1,2})月(\d{1,2})[日号]?/, md: true },
        { re: /(?<!\d)(\d{1,2})[-/](\d{1,2})(?!\d)/, md: true },
        { re: /(?<!\d)(\d{1,2})\.(\d{1,2})[日号]/, md: true },
        { re: /(?<![\d.])(\d{1,2})[号日](?!线)/, md: false }
      ];
      for (const p of patterns) {
        const m = t.match(p.re);
        if (!m) continue;
        const ds = p.md
          ? buildMonthDay(m[1], m[2], today)
          : buildMonthDay(today.getMonth() + 1, m[1], today);
        if (ds) {
          date = ds;
          t = t.replace(m[0], ' ');
          break;
        }
      }
    }
    return { text: t, date };
  }

  function longestMatch(text, map) {
    let best = null;
    for (const cat of Object.keys(map)) {
      for (const kw of map[cat]) {
        if (text.includes(kw) && (!best || kw.length > best.kw.length)) best = { cat, kw };
      }
    }
    return best;
  }

  function classify(text) {
    const hasIncome = INCOME_FEATURE_RE.test(text);
    const inc = longestMatch(text, incomeKeywordMap);
    const exp = longestMatch(text, expenseKeywordMap);
    if (hasIncome) {
      if (inc) return { type: 'income', category: inc.cat };
      if (exp && INCOME_CATEGORIES.includes(exp.cat)) return { type: 'income', category: exp.cat };
      return { type: 'income', category: '其他收入' };
    }
    if (inc && (!exp || inc.kw.length > exp.kw.length)) return { type: 'income', category: inc.cat };
    return { type: 'expense', category: exp ? exp.cat : '其他支出' };
  }

  function matchAccount(text, accounts) {
    if (!text || !Array.isArray(accounts) || accounts.length === 0) return undefined;
    // 1) 账户全名直接命中（取最长）
    let best = null;
    for (const acc of accounts) {
      if (acc && acc.name && text.includes(acc.name) && (!best || acc.name.length > best.name.length)) best = acc;
    }
    if (best) return best.id;
    // 2) 简称 / 别名命中
    for (const group of ACCOUNT_ALIAS_GROUPS) {
      if (!group.some((w) => text.includes(w))) continue;
      const hit = accounts.find((acc) => acc && acc.name && group.some((w) => acc.name.includes(w)));
      if (hit) return hit.id;
      if (group[0] === '信用卡') {
        const credit = accounts.find((acc) => acc && /credit|信用/i.test(String(acc.type || '')));
        if (credit) return credit.id;
      }
    }
    return undefined;
  }

  function extractAmount(s) {
    const unitHits = [...s.matchAll(UNIT_AMOUNT_RE)];
    if (unitHits.length) {
      const h = unitHits[unitHits.length - 1];
      let v = parseFloat(h[1]);
      if (h[2] === '毛' || h[2] === '角') v = v / 10;
      return { amount: Math.round(v * 100) / 100, token: h[0] };
    }
    const nums = s.match(PLAIN_NUM_RE);
    if (nums && nums.length) {
      const last = nums[nums.length - 1];
      return { amount: Math.round(parseFloat(last) * 100) / 100, token: last, last: true };
    }
    return null;
  }

  function buildNotes(s, amt) {
    let t = s;
    if (amt) {
      const idx = amt.last ? t.lastIndexOf(amt.token) : t.indexOf(amt.token);
      if (idx >= 0) t = t.slice(0, idx) + ' ' + t.slice(idx + amt.token.length);
    }
    t = toHalf(t)
      .replace(/(花了|花费了?|用了|消费了?|一共|总共|共计?)\s*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s:：\-—~+]+|[\s:：\-—~+]+$/g, '')
      .trim();
    return t;
  }

  /**
   * 智能多笔解析
   * @param {string} rawText 原始输入
   * @param {string|number|null} defaultAccountId 当前高亮账户（null = 纯流水）
   * @param {Array} accounts 账户列表（用于句内账户名覆盖）
   * @returns {Array} draftBills
   */
  function parseMultiMessage(rawText, defaultAccountId, accounts = [], now = new Date()) {
    if (!rawText || typeof rawText !== 'string') return [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let inheritedDate = fmtDate(today);
    const bills = [];
    const pieces = rawText.split(SPLIT_RE).map((s) => s.trim()).filter(Boolean);

    for (const piece of pieces) {
      const pieceAccount = matchAccount(piece, accounts);
      // 1. 品牌节日词数字保护（转全角，后续 \d 不再命中）
      let p = piece.replace(BRAND_NOISE_RE, (m) => toFull(m));
      // 2. 日期识别与继承
      const dr = extractDate(p, today);
      if (dr.date) inheritedDate = dr.date;
      const pieceDate = inheritedDate;
      // 3. 量词干扰数字保护
      p = dr.text.replace(UNIT_NOISE_RE, (m) => toFull(m)).trim();
      if (!p) continue;
      // 4. 无标点连写二次拆分
      const matches = [...p.matchAll(MULTI_RE)];
      let subs = [p];
      if (matches.length >= 2) {
        subs = matches.map((m) => m[0]);
        const lastM = matches[matches.length - 1];
        const tail = p.slice(lastM.index + lastM[0].length);
        if (tail.trim()) subs[subs.length - 1] += tail;
      }
      // 5. 逐句生成草稿账单
      for (const sub of subs) {
        const amt = extractAmount(sub);
        if (!amt || !(amt.amount > 0)) continue;
        const plain = toHalf(sub);
        const { type, category } = classify(plain);
        const notes = buildNotes(sub, amt) || category;
        const subAccount = matchAccount(plain, accounts);
        let accountId = subAccount !== undefined ? subAccount : (pieceAccount !== undefined ? pieceAccount : defaultAccountId);
        if (accountId === undefined || accountId === '') accountId = null;
        bills.push({
          uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          type, category, amount: amt.amount, accountId, date: pieceDate, notes
        });
      }
    }
    return bills;
  }

  const parserApi = {
    EXPENSE_CATEGORIES, INCOME_CATEGORIES, expenseKeywordMap, incomeKeywordMap, parseMultiMessage
  };

  // Node 环境（自动化测试）仅导出解析器
  if (typeof module !== 'undefined' && module.exports) module.exports = parserApi;
  if (typeof global.Vue === 'undefined') return;

  // ==================== 四、样式注入（全部 cb- 前缀，零污染） ====================
  const CSS = `
  .cb-fab{position:fixed;right:16px;bottom:calc(150px + var(--safe-bottom, 16px));width:56px;height:56px;border-radius:50%;
    z-index:46;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background:var(--bg-card,#fff);
    box-shadow:0 6px 20px rgba(0,0,0,.28);border:2.5px solid var(--primary,#3b82f6);padding:0;transition:left .25s ease,top .25s ease,transform .15s ease}
  .cb-fab.cb-dragging{transition:none;cursor:grabbing;transform:scale(1.08)}
  .cb-fab img{width:100%;height:100%;border-radius:50%;object-fit:cover;pointer-events:none;-webkit-user-drag:none}
  .cb-fab-badge{position:absolute;top:-6px;right:-10px;background:var(--primary,#3b82f6);color:#fff;font-size:10px;font-weight:800;
    padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.2);pointer-events:none}
  .cb-mask{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:60;display:flex;align-items:flex-end;justify-content:center;animation:cbFade .2s ease}
  .cb-sheet{width:100%;max-width:720px;height:83vh;background:var(--bg-card,#fff);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
    border-radius:24px 24px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;color:var(--text-main,#111);
    animation:cbUp .28s cubic-bezier(.2,.8,.2,1);padding-bottom:var(--safe-bottom,16px);position:relative;overflow:hidden}
  @keyframes cbUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  @keyframes cbFade{from{opacity:0}to{opacity:1}}
  .cb-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border-subtle,#eee)}
  .cb-head img{width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--primary,#3b82f6)}
  .cb-title{font-weight:800;font-size:15px}.cb-sub{font-size:11px;color:var(--text-muted,#888)}
  .cb-close{margin-left:auto;border:none;background:var(--bg-subtle,#f3f3f3);color:var(--text-main,#111);width:30px;height:30px;border-radius:50%;font-size:16px;cursor:pointer}
  .cb-list{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
  .cb-row{display:flex;gap:8px;align-items:flex-start}.cb-row.cb-user{justify-content:flex-end}
  .cb-ava{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0}
  .cb-bubble{max-width:78%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;
    background:var(--bg-subtle,#f3f3f3);border:1px solid var(--border-subtle,#eee)}
  .cb-user .cb-bubble{background:var(--primary,#3b82f6);color:#fff;border-color:transparent;border-bottom-right-radius:4px}
  .cb-cat .cb-bubble{border-bottom-left-radius:4px}
  .cb-card{flex:1;max-width:88%;background:var(--bg-card,#fff);border:1px solid var(--border-subtle,#eee);border-radius:16px;
    box-shadow:var(--bg-card-shadow,0 4px 14px rgba(0,0,0,.08));overflow:hidden}
  .cb-card-title{padding:10px 12px;font-size:13px;font-weight:700;border-bottom:1px dashed var(--border-subtle,#eee)}
  .cb-bill{padding:9px 12px;border-bottom:1px solid var(--border-subtle,#f0f0f0);cursor:pointer}
  .cb-bill-main{display:flex;align-items:center;gap:9px}
  .cb-ico{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px}
  .cb-ico img{width:34px;height:34px;object-fit:contain}
  .cb-bill-mid{flex:1;min-width:0}.cb-bill-l1{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700}
  .cb-tag{font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;color:#fff}
  .cb-tag.cb-exp{background:#ef4444}.cb-tag.cb-inc{background:#10b981}
  .cb-bill-l2{font-size:11px;color:var(--text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
  .cb-amt{font-weight:800;font-size:14px;white-space:nowrap}.cb-amt.cb-exp{color:#ef4444}.cb-amt.cb-inc{color:#10b981}
  .cb-del{border:none;background:transparent;color:var(--text-muted,#999);font-size:18px;cursor:pointer;padding:0 2px;line-height:1}
  .cb-edit{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .cb-edit label{font-size:10.5px;color:var(--text-muted,#888);display:flex;flex-direction:column;gap:2px}
  .cb-edit .cb-full{grid-column:1 / -1}
  .cb-edit input,.cb-edit select{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid var(--border-subtle,#ddd);
    background:var(--bg-subtle,#f7f7f7);color:var(--text-main,#111);font-size:12.5px}
  .cb-seg{display:flex;gap:4px}.cb-seg button{flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--border-subtle,#ddd);
    background:var(--bg-subtle,#f7f7f7);color:var(--text-main,#111);font-size:12px;font-weight:700;cursor:pointer}
  .cb-seg button.cb-on-exp{background:#ef4444;color:#fff;border-color:#ef4444}.cb-seg button.cb-on-inc{background:#10b981;color:#fff;border-color:#10b981}
  .cb-card-foot{display:flex;gap:8px;padding:10px 12px}
  .cb-btn{flex:1;border:none;border-radius:10px;padding:9px 10px;font-size:13px;font-weight:800;cursor:pointer}
  .cb-btn-primary{background:linear-gradient(135deg,var(--primary,#3b82f6),var(--primary-hover,var(--primary,#3b82f6)));color:#fff}
  .cb-btn-ghost{flex:0 0 auto;background:var(--bg-subtle,#f3f3f3);color:var(--text-main,#111)}
  .cb-btn:disabled{background:#9ca3af !important;color:#fff;cursor:not-allowed;opacity:.85}
  .cb-chips{display:flex;gap:6px;overflow-x:auto;padding:8px 12px 4px;scrollbar-width:none}.cb-chips::-webkit-scrollbar{display:none}
  .cb-chip{flex-shrink:0;display:flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;
    border:1.5px solid var(--border-subtle,#ddd);background:var(--bg-subtle,#f5f5f5);color:var(--text-main,#111);max-width:140px}
  .cb-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cb-chip img{width:16px;height:16px;object-fit:contain}
  .cb-chip.cb-active{border-color:var(--primary,#3b82f6);background:var(--primary,#3b82f6);color:#fff}
  .cb-input{display:flex;gap:8px;padding:6px 12px 10px;align-items:flex-end}
  .cb-input textarea{flex:1;resize:none;max-height:90px;min-height:40px;padding:10px 12px;border-radius:14px;border:1.5px solid var(--border-subtle,#ddd);
    background:var(--bg-subtle,#f7f7f7);color:var(--text-main,#111);font-size:14px;line-height:1.4;font-family:inherit;box-sizing:border-box}
  .cb-send{border:none;border-radius:14px;height:40px;padding:0 16px;font-weight:800;font-size:14px;color:#fff;cursor:pointer;
    background:linear-gradient(135deg,var(--primary,#3b82f6),var(--primary-hover,var(--primary,#3b82f6)))}
  .cb-send:disabled{opacity:.5;cursor:not-allowed}
  .cb-picker-mask{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;z-index:5}
  .cb-picker{width:100%;max-height:70%;overflow-y:auto;background:var(--bg-card,#fff);border-radius:20px 20px 0 0;padding:12px 14px 18px;box-sizing:border-box}
  .cb-picker-title{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:14px;margin-bottom:4px}
  .cb-picker-tip{font-size:11px;color:var(--text-muted,#888);margin-bottom:8px}
  .cb-pick{display:flex;align-items:center;gap:10px;padding:9px 6px;border-radius:10px;cursor:pointer;border:1.5px solid transparent}
  .cb-pick.cb-active{border-color:var(--primary,#3b82f6);background:var(--bg-subtle,#f5f5f5)}
  .cb-pick img{width:28px;height:28px;object-fit:contain}
  .cb-pick-name{flex:1;font-size:13.5px;font-weight:700}.cb-pick-bal{font-size:11px;color:var(--text-muted,#888)}
  .cb-star{border:none;background:transparent;font-size:18px;cursor:pointer;color:#f59e0b;padding:2px 4px}
  `;

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('cat-butler-style')) return;
    const el = document.createElement('style');
    el.id = 'cat-butler-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ==================== 五、Vue 组件 ====================
  const { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } = global.Vue;
  const LS_FAV = 'cat_butler_fav_accounts';
  const LS_POS = 'cat_butler_fab_pos';
  const AVATAR = 'icons/app-logo.png';

  const CatButler = {
    name: 'CatButler',
    props: {
      accounts: { type: Array, default: () => [] },
      getCategoryImg: { type: Function, default: null },
      getCategoryEmoji: { type: Function, default: null },
      getAccountIconImg: { type: Function, default: null }
    },
    emits: ['saved'],
    setup(props, { emit }) {
      injectStyle();

      const open = ref(false);
      const input = ref('');
      const listEl = ref(null);
      const fabEl = ref(null);
      const showPicker = ref(false);
      const isDragging = ref(false);
      const pos = reactive({ left: null, top: null });
      const EXP = EXPENSE_CATEGORIES;
      const INC = INCOME_CATEGORIES;

      const messages = ref([{
        role: 'cat', type: 'text',
        text: '喵~ 我是你的记账管家 🐾\n直接告诉我花了什么，比如：\n「昨天早饭10，晚饭30」\n「面条15门票30机票530」\n「收到工资8000 农行」\n我会帮你拆好账单，确认后一键入账~'
      }]);

      // ---------- 账户快捷栏 ----------
      const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
      const loadFav = () => { try { return JSON.parse(localStorage.getItem(LS_FAV) || 'null'); } catch (e) { return null; } };
      const favIds = ref(loadFav());
      const favAccounts = computed(() => {
        const accs = props.accounts || [];
        if (Array.isArray(favIds.value) && favIds.value.length) {
          const list = favIds.value.map((id) => accs.find((a) => sameId(a.id, id))).filter(Boolean);
          if (list.length) return list.slice(0, 3);
        }
        return accs.slice(0, 3);
      });
      const activeAccountId = ref(undefined); // undefined=未初始化；null=纯流水
      watch(() => props.accounts, (accs) => {
        if (activeAccountId.value === undefined && accs && accs.length) activeAccountId.value = favAccounts.value[0]?.id ?? null;
        if (activeAccountId.value !== null && activeAccountId.value !== undefined && !(accs || []).some((a) => sameId(a.id, activeAccountId.value))) {
          activeAccountId.value = favAccounts.value[0]?.id ?? null;
        }
      }, { immediate: true });

      const otherActive = computed(() => {
        const id = activeAccountId.value;
        if (id === null || id === undefined) return null;
        if (favAccounts.value.some((a) => sameId(a.id, id))) return null;
        return (props.accounts || []).find((a) => sameId(a.id, id)) || null;
      });
      const isFav = (id) => favAccounts.value.some((a) => sameId(a.id, id));
      function toggleFav(acc) {
        let ids = favAccounts.value.map((a) => a.id);
        if (ids.some((id) => sameId(id, acc.id))) ids = ids.filter((id) => !sameId(id, acc.id));
        else {
          if (ids.length >= 3) ids.shift();
          ids.push(acc.id);
        }
        favIds.value = ids;
        try { localStorage.setItem(LS_FAV, JSON.stringify(ids)); } catch (e) { /* ignore */ }
      }
      function pickAccount(id) { activeAccountId.value = id; showPicker.value = false; }

      const accountName = (id) => {
        if (id === null || id === undefined || id === '') return '⚡ 纯流水';
        const acc = (props.accounts || []).find((a) => sameId(a.id, id));
        return acc ? acc.name : '未知账户';
      };
      const accIcon = (acc) => (props.getAccountIconImg ? props.getAccountIconImg(acc) : '') || '';
      const catImg = (cat) => (props.getCategoryImg ? (props.getCategoryImg(ICON_ALIAS[cat] || cat) || '') : '');
      const catEmoji = (cat) => (props.getCategoryEmoji ? props.getCategoryEmoji(ICON_ALIAS[cat] || cat) : '📦') || '📦';
      const fmtMoney = (v) => (Number(v) || 0).toFixed(2);

      // ---------- 消息与解析 ----------
      function scrollBottom() {
        nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; });
      }
      function catSay(text) { messages.value.push({ role: 'cat', type: 'text', text }); scrollBottom(); }

      function send() {
        const text = input.value.trim();
        if (!text) return;
        messages.value.push({ role: 'user', type: 'text', text });
        input.value = '';
        const defaultId = activeAccountId.value === undefined ? null : activeAccountId.value;
        const bills = parseMultiMessage(text, defaultId, props.accounts || []);
        if (!bills.length) {
          catSay('喵？没找到金额呢~ 试试「午饭25」或「昨天打车18元」这样说吧 🐟');
          return;
        }
        messages.value.push({
          role: 'cat', type: 'confirm_card',
          text: `喵~ 帮你拆出 ${bills.length} 笔账单，点击任意一行可修改：`,
          draftBills: bills, status: 'pending', editingIndex: -1, saving: false, savedCount: 0
        });
        scrollBottom();
      }
      function onKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      }

      // ---------- 卡片编辑 ----------
      function toggleEdit(msg, idx) {
        if (msg.status !== 'pending') return;
        msg.editingIndex = msg.editingIndex === idx ? -1 : idx;
      }
      function setType(bill, type) {
        if (bill.type === type) return;
        bill.type = type;
        const list = type === 'income' ? INC : EXP;
        if (!list.includes(bill.category)) bill.category = type === 'income' ? '其他收入' : '其他支出';
      }
      function removeBill(msg, idx) {
        if (msg.status !== 'pending') return;
        msg.draftBills.splice(idx, 1);
        msg.editingIndex = -1;
      }
      function cancelCard(msg) {
        if (msg.status !== 'pending' || msg.saving) return;
        msg.status = 'cancelled';
        msg.editingIndex = -1;
        catSay('好的喵，这几笔先不记啦~');
      }

      // ---------- 确认入账（复用原有 recordTransaction / addTransaction，并触发主应用刷新） ----------
      async function confirmCard(msg) {
        if (msg.status !== 'pending' || msg.saving) return;
        if (!msg.draftBills.length) { catSay('卡片里没有账单了喵~'); return; }
        for (let i = 0; i < msg.draftBills.length; i++) {
          const b = msg.draftBills[i];
          if (!(Number(b.amount) > 0)) { catSay(`第 ${i + 1} 笔金额无效，请修改后再确认喵~`); return; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) { catSay(`第 ${i + 1} 笔日期格式不对喵~`); return; }
        }
        const DB = (typeof AssetDB !== 'undefined') ? AssetDB : global.AssetDB; // eslint-disable-line no-undef
        msg.saving = true;
        msg.editingIndex = -1;
        let saved = 0;
        try {
          for (const b of msg.draftBills) {
            const payload = {
              type: b.type,
              amount: Math.round(Number(b.amount) * 100) / 100,
              accountId: (b.accountId === undefined || b.accountId === '') ? null : b.accountId,
              toAccountId: null,
              category: b.category,
              date: b.date,
              notes: b.notes ? `[喵咪管家] ${b.notes}` : '[喵咪管家] 对话记账'
            };
            if (global.assetDB && typeof global.assetDB.recordTransaction === 'function') await global.assetDB.recordTransaction(payload);
            else await DB.addTransaction(payload);
            saved++;
          }
          msg.savedCount = saved;
          msg.status = 'confirmed';
          emit('saved', saved);
          catSay(`喵呜~ 已成功入账 ${saved} 笔，账户余额已同步 ✨`);
        } catch (err) {
          if (saved > 0) {
            msg.draftBills.splice(0, saved); // 已入账部分移出卡片，杜绝重复扣款
            emit('saved', saved);
          }
          catSay(`入账出错了喵：${err && err.message ? err.message : err}${saved ? `\n（已成功入账 ${saved} 笔，剩余可重试）` : ''}`);
        } finally {
          msg.saving = false;
        }
      }

      // ---------- 悬浮球拖拽与贴边 ----------
      let drag = null;
      const fabStyle = computed(() => (pos.left === null ? {} : { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' }));
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      function snap(left, top, w, h) {
        const vw = global.innerWidth, vh = global.innerHeight;
        pos.left = (left + w / 2 < vw / 2) ? 12 : vw - w - 12;
        pos.top = clamp(top, 70, Math.max(70, vh - h - 80));
        try { localStorage.setItem(LS_POS, JSON.stringify({ side: pos.left === 12 ? 'l' : 'r', topRatio: pos.top / vh })); } catch (e) { /* ignore */ }
      }
      function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const r = fabEl.value.getBoundingClientRect();
        drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, w: r.width, h: r.height, moved: false };
        try { fabEl.value.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      function onPointerMove(e) {
        if (!drag) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        isDragging.value = true;
        e.preventDefault();
        pos.left = clamp(drag.ox + dx, 0, global.innerWidth - drag.w);
        pos.top = clamp(drag.oy + dy, 0, global.innerHeight - drag.h);
      }
      function onPointerUp() {
        if (!drag) return;
        const d = drag;
        drag = null;
        isDragging.value = false;
        if (!d.moved) { openSheet(); return; }
        snap(pos.left, pos.top, d.w, d.h);
      }
      function restorePos() {
        try {
          const saved = JSON.parse(localStorage.getItem(LS_POS) || 'null');
          if (!saved) return;
          const vw = global.innerWidth, vh = global.innerHeight, size = 56;
          pos.left = saved.side === 'l' ? 12 : vw - size - 12;
          pos.top = clamp(saved.topRatio * vh, 70, Math.max(70, vh - size - 80));
        } catch (e) { /* ignore */ }
      }
      function onResize() {
        if (pos.left === null || !fabEl.value) return;
        const r = fabEl.value.getBoundingClientRect();
        snap(r.left, r.top, r.width, r.height);
      }
      onMounted(() => { restorePos(); global.addEventListener('resize', onResize); });
      onBeforeUnmount(() => global.removeEventListener('resize', onResize));

      function openSheet() { open.value = true; scrollBottom(); }
      function closeSheet() { open.value = false; showPicker.value = false; }

      return {
        AVATAR, EXP, INC, open, input, listEl, fabEl, showPicker, isDragging, fabStyle, messages,
        favAccounts, activeAccountId, otherActive, isFav, toggleFav, pickAccount, sameId,
        accountName, accIcon, catImg, catEmoji, fmtMoney,
        send, onKeydown, toggleEdit, setType, removeBill, cancelCard, confirmCard,
        onPointerDown, onPointerMove, onPointerUp, openSheet, closeSheet
      };
    },
    template: `
<div class="cb-root">
  <button v-show="!open" ref="fabEl" class="cb-fab" :class="{ 'cb-dragging': isDragging }" :style="fabStyle" title="喵咪管家 · 对话记账"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
    <img :src="AVATAR" alt="喵咪管家" draggable="false">
    <span class="cb-fab-badge">喵记账</span>
  </button>

  <div v-if="open" class="cb-mask" @click.self="closeSheet">
    <div class="cb-sheet">
      <div class="cb-head">
        <img :src="AVATAR" alt="">
        <div><div class="cb-title">喵咪管家</div><div class="cb-sub">说一句话，帮你拆账入账</div></div>
        <button class="cb-close" @click="closeSheet">×</button>
      </div>

      <div ref="listEl" class="cb-list">
        <template v-for="(msg, mi) in messages" :key="mi">
          <div v-if="msg.type === 'text'" class="cb-row" :class="msg.role === 'user' ? 'cb-user' : 'cb-cat'">
            <img v-if="msg.role === 'cat'" class="cb-ava" :src="AVATAR" alt="">
            <div class="cb-bubble">{{ msg.text }}</div>
          </div>

          <div v-else-if="msg.type === 'confirm_card'" class="cb-row cb-cat">
            <img class="cb-ava" :src="AVATAR" alt="">
            <div class="cb-card">
              <div class="cb-card-title">{{ msg.text }}</div>
              <div v-for="(bill, bi) in msg.draftBills" :key="bill.uid" class="cb-bill">
                <div class="cb-bill-main" @click="toggleEdit(msg, bi)">
                  <div class="cb-ico">
                    <img v-if="catImg(bill.category)" :src="catImg(bill.category)" alt="">
                    <span v-else>{{ catEmoji(bill.category) }}</span>
                  </div>
                  <div class="cb-bill-mid">
                    <div class="cb-bill-l1">
                      <span class="cb-tag" :class="bill.type === 'income' ? 'cb-inc' : 'cb-exp'">{{ bill.type === 'income' ? '收入' : '支出' }}</span>
                      <span>{{ bill.category }}</span>
                    </div>
                    <div class="cb-bill-l2">{{ accountName(bill.accountId) }} · {{ bill.date }}<template v-if="bill.notes"> · {{ bill.notes }}</template></div>
                  </div>
                  <div class="cb-amt" :class="bill.type === 'income' ? 'cb-inc' : 'cb-exp'">{{ bill.type === 'income' ? '+' : '-' }}¥{{ fmtMoney(bill.amount) }}</div>
                  <button v-if="msg.status === 'pending'" class="cb-del" title="删除" @click.stop="removeBill(msg, bi)">×</button>
                </div>

                <div v-if="msg.status === 'pending' && msg.editingIndex === bi" class="cb-edit" @click.stop>
                  <div class="cb-seg cb-full">
                    <button type="button" :class="{ 'cb-on-exp': bill.type === 'expense' }" @click="setType(bill, 'expense')">支出</button>
                    <button type="button" :class="{ 'cb-on-inc': bill.type === 'income' }" @click="setType(bill, 'income')">收入</button>
                  </div>
                  <label>分类
                    <select v-model="bill.category">
                      <option v-for="c in (bill.type === 'income' ? INC : EXP)" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </label>
                  <label>账户
                    <select v-model="bill.accountId">
                      <option :value="null">⚡ 纯流水 (不计入资产)</option>
                      <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                    </select>
                  </label>
                  <label>金额 (¥)<input type="number" step="0.01" min="0" inputmode="decimal" v-model.number="bill.amount"></label>
                  <label>日期<input type="date" v-model="bill.date"></label>
                  <label class="cb-full">备注<input type="text" v-model="bill.notes" placeholder="备注（可选）"></label>
                </div>
              </div>

              <div class="cb-card-foot">
                <template v-if="msg.status === 'pending'">
                  <button class="cb-btn cb-btn-ghost" :disabled="msg.saving" @click="cancelCard(msg)">取消</button>
                  <button class="cb-btn cb-btn-primary" :disabled="msg.saving || !msg.draftBills.length" @click="confirmCard(msg)">
                    {{ msg.saving ? '入账中…' : '确认入账 (共 ' + msg.draftBills.length + ' 笔)' }}
                  </button>
                </template>
                <button v-else-if="msg.status === 'confirmed'" class="cb-btn" disabled>✅ 已成功入账 {{ msg.savedCount }} 笔，账户余额已同步</button>
                <button v-else class="cb-btn" disabled>已取消</button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="cb-chips">
        <button v-for="acc in favAccounts" :key="acc.id" class="cb-chip" :class="{ 'cb-active': sameId(activeAccountId, acc.id) }" @click="pickAccount(acc.id)">
          <img v-if="accIcon(acc)" :src="accIcon(acc)" alt=""><span>{{ acc.name }}</span>
        </button>
        <button class="cb-chip" :class="{ 'cb-active': activeAccountId === null }" @click="pickAccount(null)"><span>⚡ 纯流水</span></button>
        <button class="cb-chip" :class="{ 'cb-active': !!otherActive }" @click="showPicker = true">
          <template v-if="otherActive"><img v-if="accIcon(otherActive)" :src="accIcon(otherActive)" alt=""><span>{{ otherActive.name }}</span></template>
          <span v-else>+ 其他账户</span>
        </button>
      </div>

      <div class="cb-input">
        <textarea v-model="input" rows="1" placeholder="例如：昨天早饭10，晚饭30 / 收到工资8000" @keydown="onKeydown"></textarea>
        <button class="cb-send" :disabled="!input.trim()" @click="send">发送</button>
      </div>

      <div v-if="showPicker" class="cb-picker-mask" @click.self="showPicker = false">
        <div class="cb-picker">
          <div class="cb-picker-title"><span>选择记账账户</span><button class="cb-close" @click="showPicker = false">×</button></div>
          <div class="cb-picker-tip">点击切换当前账户；点 ☆ 设为常用（最多 3 个，显示在输入框上方）</div>
          <div class="cb-pick" :class="{ 'cb-active': activeAccountId === null }" @click="pickAccount(null)">
            <span style="font-size:22px;width:28px;text-align:center">⚡</span>
            <div class="cb-pick-name">纯流水 (不计入资产)</div>
          </div>
          <div v-for="acc in accounts" :key="acc.id" class="cb-pick" :class="{ 'cb-active': sameId(activeAccountId, acc.id) }" @click="pickAccount(acc.id)">
            <img v-if="accIcon(acc)" :src="accIcon(acc)" alt="">
            <div style="flex:1;min-width:0">
              <div class="cb-pick-name">{{ acc.name }}</div>
              <div class="cb-pick-bal">余额 ¥{{ fmtMoney(acc.balance) }}</div>
            </div>
            <button class="cb-star" :title="isFav(acc.id) ? '取消常用' : '设为常用'" @click.stop="toggleFav(acc)">{{ isFav(acc.id) ? '★' : '☆' }}</button>
          </div>
          <div v-if="!accounts.length" class="cb-picker-tip">还没有账户喵，可先用「纯流水」记账~</div>
        </div>
      </div>
    </div>
  </div>
</div>`
  };

  global.CatButler = CatButler;
  global.CatButlerParser = parserApi;
})(typeof window !== 'undefined' ? window : globalThis);

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
    '奖金分红', '礼金人情', '退款返还', '其他收入'
  ];

  // 1. 支出分类字典（严格对应系统现有的 17 个支出分类）
  const expenseKeywordMap = {
    '餐饮美食': [
      '烧烤', '烤串', '饮料', '冷饮', '雪糕', '冰淇淋', '冰棍', '水果', '榴莲', '草莓', '西瓜', '苹果', '香蕉', '车厘子',
      '面包', '吐司', '蛋糕', '甜品', '点心', '蛋挞', '泡芙', '麻辣烫', '麻辣拌', '冒菜', '关东煮', '面条', '拉面', '牛肉面', '炸酱面', '小面', '板面', '热干面', '意面',
      '包子', '小笼包', '生煎', '饺子', '水饺', '煎饺', '馄饨', '抄手', '云吞', '馒头', '花卷', '油条', '豆浆', '煎饼', '手抓饼', '肉夹馍', '肠粉', '粥', '茶叶蛋',
      '餐饮', '美食', '吃', '喝', '面', '饭', '菜', '外卖', '早餐', '早饭', '早点', '午餐', '午饭', '中饭', '晚餐', '晚饭', '宵夜', '夜宵', '下午茶',
      '聚餐', '下馆子', '大餐', '自助餐', '快餐', '便当', '盒饭', '盖饭', '猪脚饭', '黄焖鸡', '沙县', '兰州拉面', '煲仔饭', '炒饭', '炒菜', '卤味', '鸭脖', '绝味', '周黑鸭',
      '米粉', '螺蛳粉', '酸辣粉', '米线', '过桥米线', '河粉', '凉皮', '牛杂', '火锅', '海底捞', '串串', '烤肉', '烤鱼', '酸菜鱼', '小龙虾', '牛排', '日料', '寿司', '刺身', '韩料',
      '炸鸡', '汉堡', '薯条', '披萨', '三明治', '沙拉', '轻食',
      '奶茶', '果茶', '柠檬茶', '咖啡', '拿铁', '美式', '星巴克', '瑞幸', '库迪', '喜茶', '奈雪', '霸王茶姬', '蜜雪冰城', '茶百道', '古茗', '一点点', 'CoCo',
      '零食', '辣条', '薯片', '坚果', '卤蛋', '肉干', '巧克力', '糖果', '饼干', '泡面', '方便面', '火腿肠', '矿泉水', '纯净水', '可乐', '雪碧', '汽水', '酸奶', '牛奶', '啤酒', '白酒', '红酒', '喝酒', '精酿',
      '麦当劳', '金拱门', '肯德基', 'KFC', 'kfc', '汉堡王', '德克士', '华莱士', '必胜客', '萨莉亚', '达美乐', '塔斯汀',
      '买菜', '菜市场', '菜场', '生鲜', '盒马', '叮咚买菜', '朴朴', '山姆', '超市买菜', '猪肉', '牛肉', '鸡肉', '排骨', '买肉', '买鱼', '虾', '鸡蛋', '蔬菜', '青菜', '葱', '姜', '蒜', '调料', '酱油', '食用油', '大米', '美团外卖', '饿了么'
    ],

    '交通出行': [
      '交通', '出行', '公交', '公交车', '巴士', '大巴', '中巴', '地铁', '轻轨', '磁悬浮', '打车', '出租车', '的士', '打的', '滴滴', '高德打车', '网约车', '顺风车', '拼车', '专车', '快车', '花小猪', '曹操', 'T3', '享道',
      '单车', '共享单车', '小黄车', '哈啰', '美团单车', '青桔', '电动车', '电瓶车',
      '高铁', '动车', '火车', '火车票', '高铁票', '12306', '机票', '飞机', '航班', '燃油附加费', '船票', '轮渡', '轮船', '客运', '长途车', '公交卡', '交通卡', '羊城通', '岭南通', '乘车码'
    ],

    '购物消费': [
      '购物', '消费', '买', '淘宝', '天猫', '京东', '拼多多', '抖音商城', '小红书购买', '唯品会', '得物', '闲鱼买', '代购', '海淘', '网购', '逛街', '商场', '专柜', '奥莱', '尾款',
      '衣服', '服装', '上衣', '外套', '羽绒服', '大衣', '风衣', '夹克', '毛衣', '卫衣', '衬衫', 'T恤', '短袖', '背心', '裤子', '牛仔裤', '休闲裤', '短裤', '秋裤', '打底裤', '裙子', '连衣裙', '半身裙',
      '鞋', '鞋子', '运动鞋', '球鞋', '跑鞋', '皮鞋', '靴子', '短靴', '凉鞋', '拖鞋', '高跟鞋', '袜子', '丝袜', '内衣', '内裤', '文胸', '睡衣', '家居服', '泳衣', '泳裤', '泳镜',
      '包', '包包', '背包', '双肩包', '挎包', '手提包', '钱包', '卡包', '行李箱', '拉杆箱',
      '帽子', '围巾', '手套', '皮带', '腰带', '墨镜', '太阳镜', '眼镜', '配眼镜', '隐形眼镜', '美瞳', '雨伞', '遮阳伞',
      '首饰', '项链', '手链', '手镯', '戒指', '耳环', '耳钉', '胸针', '发饰', '发夹', '皮筋', '手表', '优衣库', 'ZARA', '迪卡侬', '无印良品', '名创优品'
    ],

    '休闲娱乐': [
      '休闲', '娱乐', '电影', '看电影', '电影票', '爆米花', '游戏', '打游戏', 'Steam', 'steam', 'Switch', 'PS5', '王者', '原神', '吃鸡', '点卡', '月卡', '战令', '氪金', '买皮肤', '抽卡', '充值游戏',
      '玩', '去玩', '充值', '会员', 'VIP', 'vip', '视频会员', '腾讯视频', '爱奇艺', '优酷', 'B站大会员', '哔哩哔哩', '网易云', 'QQ音乐', '百度网盘', '88VIP',
      '唱歌', 'KTV', 'ktv', '剧本杀', '密室', '密室逃脱', '桌游', '狼人杀', '麻将', '棋牌', '台球', '桌球', '保龄球', '射箭', '溜冰', '滑冰', '滑雪', '蹦床', '卡丁车', '电玩城', '游戏厅', '抓娃娃', '娃娃机', '盲盒', '泡泡玛特', '手办', '谷子', '周边', '乐高', '拼图',
      '网吧', '网咖', '酒吧', '清吧', '夜店', 'Livehouse', '音乐节', '演唱会', '话剧', '脱口秀', '舞台剧', '音乐会', '展览', '看展', '博物馆', '漫展', '游乐园', '迪士尼', '环球影城', '欢乐谷', '长隆', '方特', '摩天轮',
      '按摩', '足疗', '洗脚', '采耳', 'SPA', 'spa', '推拿', '泡澡', '洗浴', '汗蒸', '温泉', '汤泉', '钓鱼', '露营', '烧烤场地', '健身', '健身房', '私教', '游泳', '游泳馆', '游泳卡', '羽毛球', '网球', '篮球', '瑜伽', '普拉提', '吉他', '琴弦', '拨片', '乐器'
    ],

    '日用百货': [
      '日用', '百货', '日用品', '生活用品', '杂货', '小商品', '超市日用', '便利店',
      '纸巾', '抽纸', '卷纸', '卫生纸', '湿巾', '湿厕纸', '厨房纸', '卫生巾', '护垫', '棉柔巾', '洗脸巾',
      '洗发水', '护发素', '发膜', '沐浴露', '香皂', '肥皂', '洗手液', '牙膏', '牙刷', '电动牙刷头', '牙线', '漱口水', '毛巾', '浴巾', '搓澡巾', '梳子', '剃须刀', '刀片',
      '洗衣液', '洗衣粉', '洗衣凝珠', '柔顺剂', '漂白水', '洗洁精', '洗碗块', '洁厕灵', '消毒液', '84消毒液', '酒精', '除霉剂', '管道疏通', '空气清新剂', '香薰', '樟脑丸', '除湿袋', '杀虫剂', '蚊香', '电蚊香', '花露水',
      '垃圾袋', '保鲜膜', '保鲜袋', '密封袋', '锡纸', '一次性手套', '纸杯', '吸管', '牙签', '棉签',
      '扫把', '拖把', '抹布', '百洁布', '钢丝球', '垃圾桶', '脸盆', '水桶', '衣架', '晾衣架', '夹子', '收纳盒', '收纳箱', '挂钩', '粘钩',
      '碗', '盘子', '筷子', '勺子', '叉子', '菜刀', '案板', '砧板', '锅', '炒锅', '平底锅', '保温杯', '水杯', '茶杯', '饭盒', '便当盒',
      '电池', '五号电池', '七号电池', '排插', '插线板', '灯泡', '灯管', '胶带', '双面胶', '502', '胶水', '剪刀', '指甲刀', '螺丝刀', '五金', '针线', '暖宝宝', '热水袋',
      '猫粮', '猫罐头', '猫条', '冻干', '猫砂', '猫抓板', '逗猫棒', '宠物用品', '驱虫药'
    ],

    '住房物业': [
      '住房', '物业', '房租', '交租', '租金', '押金', '中介费', '房贷', '还房贷', '按揭', '公积金贷款',
      '水电', '水电费', '水费', '电费', '充电费', '燃气', '燃气费', '煤气', '煤气费', '天然气', '暖气', '暖气费', '取暖费', '物业费', '管理费', '卫生费', '垃圾费',
      '宽带', '网费', '电信', '移动', '联通', '话费', '充话费', '手机费', '流量包', '固话', '有线电视',
      '维修', '家政', '保洁', '钟点工', '清洗空调', '修空调', '修水管', '修马桶', '通下水道', '换锁', '开锁', '配钥匙', '搬家', '搬家费', '货拉拉', '快递费', '寄快递', '顺丰', '邮费',
      '装修', '建材', '油漆', '墙纸', '窗帘', '地毯', '地垫', '四件套', '床单', '被套', '被子', '枕头', '床垫', '凉席',
      '家具', '沙发', '茶几', '餐桌', '椅子', '办公椅', '电脑桌', '书桌', '衣柜', '鞋柜', '床', '书架', '置物架', '台灯', '吸顶灯',
      '家电', '冰箱', '洗衣机', '烘干机', '空调', '电视', '热水器', '油烟机', '燃气灶', '洗碗机', '微波炉', '烤箱', '空气炸锅', '电饭煲', '破壁机', '豆浆机', '烧水壶', '电水壶', '电磁炉', '电风扇', '取暖器', '加湿器', '除湿机', '空气净化器', '吸尘器', '扫地机器人', '吹风机', '电吹风', '挂烫机', '熨斗'
    ],

    '医疗保健': [
      '医疗', '保健', '药', '买药', '药店', '大药房', '感冒药', '退烧药', '布洛芬', '消炎药', '头孢', '阿莫西林', '止痛药', '胃药', '肠胃药', '蒙脱石散', '益生菌', '咽炎片', '止咳糖浆', '眼药水', '鼻炎喷雾', '膏药', '创可贴', '碘伏', '酒精棉片', '纱布', '体温计', '血压计', '血糖仪', '口罩', '抗原',
      '看病', '就医', '医院', '门诊', '急诊', '诊所', '社康', '社区医院', '挂号', '挂号费', '诊疗费', '检查费', '化验', '验血', '血常规', '拍片', 'X光', 'CT', '核磁共振', 'B超', '彩超', '心电图', '胃镜', '肠镜',
      '住院', '手术', '打针', '输液', '吊水', '点滴', '换药', '拆线', '理疗', '针灸', '拔罐', '正骨', '康复',
      '牙', '看牙', '牙科', '口腔', '洗牙', '洁牙', '补牙', '拔牙', '智齿', '根管治疗', '牙冠', '种牙', '种植牙', '正畸', '牙套', '眼科', '查视力', '皮肤科',
      '体检', '体检费', '入职体检', '健康证', '疫苗', '打疫苗', 'HPV', '流感疫苗', '狂犬疫苗', '医保', '医疗险',
      '保健品', '维生素', '维C', '复合维生素', '叶黄素', '鱼油', '深海鱼油', '辅酶Q10', '钙片', '蛋白粉', '氨糖', '褪黑素', '酵素', '护肝片', '阿胶', '燕窝', '枸杞', '西洋参'
    ],

    '美容美发': [
      '美容', '美发', '理发', '剪发', '剪头发', '洗头', '洗剪吹', '烫发', '烫头', '染发', '染头', '做头发', '接发', '护理头发', '发廊', '理发店', '托尼',
      '护肤', '护肤品', '洗面奶', '洁面', '爽肤水', '化妆水', '柔肤水', '精华', '精华液', '眼霜', '乳液', '面霜', '保湿霜', '防晒', '防晒霜', '防晒喷雾', '隔离', '面膜', '涂抹面膜', '唇膏', '润唇膏', '护手霜', '身体乳', '磨砂膏', '脱毛膏', '芦荟胶', '祛痘', '黑头',
      '化妆', '化妆品', '彩妆', '妆造', '底妆', '粉底', '粉底液', '气垫', 'BB霜', '遮瑕', '散粉', '定妆粉', '定妆喷雾', '高光', '修容', '腮红', '眼影', '眼线', '眼线笔', '睫毛膏', '假睫毛', '眉笔', '眉粉', '口红', '唇釉', '唇彩', '卸妆', '卸妆水', '卸妆油', '卸妆膏', '化妆棉', '美妆蛋', '粉扑', '化妆刷',
      '香水', '香膏', '美甲', '做指甲', '卸甲', '指甲油', '美睫', '种睫毛', '纹眉', '修眉', '脱毛', '洗脸', '小气泡', '刷酸', '光子嫩肤', '水光针', '医美', '美容院'
    ],

    '学习教育': [
      '学习', '教育', '书', '买书', '图书', '教材', '课本', '辅导书', '真题', '试卷', '题库', '刷题', '新华书店', '当当', '樊登', '微信读书', '知网',
      '课', '课程', '网课', '买课', '慕课', '知识付费', '专栏', '星球', '知识星球', '培训', '培训班', '辅导班', '补习', '私教课', '驾校', '考驾照', '学车', '科目二', '科目三',
      '考试', '考证', '软考', '系统规划与管理师', '高项', '中项', '教资', '雅思', '托福', '四六级', '考研', '考公', '报名费', '考试费', '评审费', '继续教育', '学费', '书本费', '住宿费',
      '文具', '笔', '中性笔', '签字笔', '钢笔', '铅笔', '荧光笔', '马克笔', '笔记本', '本子', '草稿纸', '便利贴', '文件夹', '文件袋', '订书机', '回形针', '计算器', '书包',
      '打印', '复印', '扫描', '装订', '相册制作', '冲印', '洗照片', '证件照', '资料', '讲义', '教程', '外语', '学英语', '多邻国', '百词斩'
    ],

    '家庭育儿': [
      '家庭', '育儿', '宝宝', '婴儿', '小孩', '孩子', '娃娃', '闺女', '儿子', '母婴',
      '奶粉', '一段', '二段', '三段', '羊奶粉', '辅食', '果泥', '肉泥', '磨牙棒', '溶豆', '儿童钙', 'AD滴剂', '伊可新',
      '尿不湿', '纸尿裤', '拉拉裤', '隔尿垫', '婴儿湿巾', '奶瓶', '奶嘴', '吸奶器', '温奶器', '消毒锅', '口水巾', '围兜', '婴儿爽身粉', '护臀膏', '婴儿沐浴露',
      '童装', '童鞋', '婴儿服', '连体衣', '包被', '睡袋', '婴儿车', '推车', '溜娃神器', '安全座椅', '婴儿床', '学步车', '背带', '腰凳',
      '玩具', '儿童玩具', '积木', '毛绒玩具', '玩具车', '绘本', '故事书', '早教', '早教机', '早教班', '托班', '托管', '幼儿园', '兴趣班', '舞蹈班', '美术班', '钢琴课', '围棋', '夏令营', '游学', '家长会', '班费', '校服', '家用', '孝敬父母'
    ],

    '车辆座驾': [
      '车辆', '座驾', '汽车', '养车', '车子', '加油', '加满', '92号', '95号', '98号', '汽油', '柴油', '石化', '石油', '充电桩', '汽车充电', '特来电', '星星充电',
      '停车', '停车费', '车位', '车位费', '月保', '临停', '过路费', '高速费', '通行费', 'ETC', 'etc', '过桥费',
      '洗车', '精洗', '自助洗车', '打蜡', '镀晶', '贴车膜', '车衣', '改色膜', '脚垫', '座套', '车载充电器', '手机支架', '行车记录仪', 'ETC设备', '玻璃水', '防冻液', '机油', '雨刮器', '车载香薰', '车品',
      '保养', '小保养', '大保养', '4S店', '途虎', '修车', '补胎', '换轮胎', '轮胎', '电瓶', '蓄电池', '刹车片', '钣金', '喷漆', '救援', '拖车',
      '车险', '交强险', '商业险', '车船税', '年检', '审车', '车贷', '还车贷', '罚单', '违章', '罚款', '扣分', '代驾', '叫代驾', '租车', '一嗨', '神州租车', '摇号', '车牌'
    ],

    '电子设备': [
      '电子', '设备', '数码', '科技', '3C', '硬件', '外设', '装机', '配电脑',
      '手机', 'iPhone', '华为手机', '小米手机', '苹果手机', '平板', 'iPad', 'ipad', 'MatePad', '电脑', '笔记本电脑', 'MacBook', '台式机', '主机', '迷你主机',
      '显示器', '屏幕', '显卡', 'CPU', '主板', '内存', '内存条', '固态硬盘', 'SSD', '硬盘', '移动硬盘', 'U盘', '内存卡', 'SD卡', 'TF卡', 'NAS', '路由器', '光猫', '交换机', '网线', '拓展坞', '分线器',
      '键盘', '机械键盘', '键帽', '鼠标', '无线鼠标', '鼠标垫', '耳机', '蓝牙耳机', 'AirPods', '降噪耳机', '头戴式耳机', '音箱', '音响', '麦克风', '话筒', '摄像头', '手写笔', 'Apple Pencil',
      '相机', '单反', '微单', '索尼相机', '佳能', '富士', '镜头', '三脚架', '稳定器', '云台', '补光灯', '闪光灯', '柔光箱', '相机包', '快门线', '读卡器', '摄影器材', '无人机', '大疆', 'Pocket', 'GoPro', '拍立得', '相纸',
      '智能手表', 'Apple Watch', '手环', '充电宝', '移动电源', '共享充电宝', '充电器', '充电头', '氮化镓', '数据线', '充电线', '转接头', '手机壳', '保护壳', '保护套', '贴膜', '钢化膜', '镜头膜', '散热器', '修手机', '换电池', '换屏幕'
    ],

    '投资理财': [
      '买基', '买基金', '基金定投', '定投', '买股票', '加仓', '补仓', '建仓', '打新缴款', '买债券', '买国债',
      '买黄金', '买金', '买金条', '买金豆', '积存金买入', '存钱', '存定期', '大额存单', '结构性存款',
      '买保险', '重疾险', '意外险', '寿险', '年金险', '交易手续费', '交易佣金', '印花税', '理财亏损', '股票亏损', '基金亏损', '浮亏', '割肉'
    ],

    '数字资产': [
      '买软件', '软件订阅', '订阅续费', '苹果内购', 'AppStore', 'Google Play',
      '云服务器', '买服务器', '服务器续费', 'VPS', 'ECS', '华为云', '阿里云', '腾讯云', '买域名', '域名续费', 'SSL证书', 'CDN', 'OSS', '对象存储',
      '梯子', '机场', 'VPN', '节点', '代理', '科学上网', '抓包',
      'AI会员', 'ChatGPT', 'Claude', 'Midjourney', 'Cursor', 'Copilot', 'API充值', 'Token充值', '买算力', '硅基流动充值', 'DeepSeek充值',
      'iCloud', 'OneDrive', 'Google One', '网盘会员', 'WPS会员', 'Office', 'Adobe', 'PS会员', '剪映会员', '美图秀秀会员', 'Flaticon', '素材网', '买字体', '买源码', '买插件', '买主题', '买币'
    ],

    '礼金人情': [
      '发红包', '给红包', '微信发红包', '发压岁钱', '派利是', '开工利是支出',
      '随礼', '份子钱', '分子钱', '随份子', '结婚随礼', '喝喜酒', '满月酒随礼', '百日宴', '周岁宴', '乔迁随礼', '升学宴', '寿宴', '白事', '丧事', '帛金',
      '请客', '请吃饭', '请喝奶茶', '做东', '买单', '送礼', '买礼物', '生日礼物', '情人节礼物', '纪念日礼物', '母亲节礼物', '父亲节礼物', '教师节礼物', '中秋送礼', '过年送礼', '伴手礼', '买花', '鲜花', '玫瑰', '花束', '果篮', '送烟酒', '送茶叶', '购物卡支出',
      '孝敬', '给父母', '给爸妈', '给零花钱', '给生活费', '转账给', '借出', '借给', '捐款', '水滴筹', '慈善'
    ],

    '旅游探索': [
      '旅游', '旅行', '探索', '度假', '出游', '自由行', '跟团游', '自驾游', '穷游', '周边游', '踏青', '秋游',
      '酒店', '订酒店', '宾馆', '旅馆', '民宿', '青旅', '客栈', '钟点房', '住宿', '住宿费', '房费', '携程', '去哪儿', '飞猪', '美团酒店', 'Airbnb', '爱彼迎', '华住会',
      '门票', '景区', '景点', '公园门票', '动物园', '植物园', '海洋馆', '古镇', '索道', '缆车', '观光车', '游船', '导游', '讲解器', '租讲解', '旅拍', '租汉服',
      '签证', '办签证', '护照', '港澳通行证', '签注', '换汇', '外币', '泰铢', '日元', '美元', '漫游费', '境外流量卡', '旅游保险',
      '特产', '旅游伴手礼', '纪念品', '明信片', '冰箱贴', '免税店', '行李寄存'
    ],

    '其他支出': [
      '其他支出', '其它支出', '其他', '其它', '杂费', '杂项', '意外支出', '丢钱', '掉了', '遗失', '赔偿支出', '滞纳金', '违约金', '手续费', '补办', '工本费'
    ]
  };

  // 2. 收入分类字典（严格对应系统现有的 9 个收入分类，命中时将 type 设为 'income'）
  const incomeKeywordMap = {
    '工资薪酬': [
      '工资薪酬', '发工资', '工资', '薪水', '薪酬', '底薪', '月薪', '基本工资', '发薪', '发薪水', '工资到账',
      '津贴', '补贴', '餐补', '饭补', '交通补贴', '通讯补贴', '住房补贴', '高温补贴', '取暖补贴', '出差补贴', '差旅补贴', '值班费', '加班费', '公积金提取', '公积金到账'
    ],

    '营业盈余': [
      '营业盈余', '营业', '盈余', '营业额', '营业收入', '营收', '利润', '净利润', '毛利', '营收结算',
      '店铺收入', '小店收入', '门店收入', '工作室收入', '摄影工作室', '客片尾款', '客片收入', '相册尾款', '订单收入',
      '结款', '项目回款', '回款', '工程款', '尾款到账', '收到尾款', '定金收入', '收到定金', '货款', '收到货款', '结算款', '生意收入', '做生意赚'
    ],

    '投资理财': [
      '理财收益', '投资收益', '理财赚', '投资赚', '基金收益', '基金赚钱', '基金赎回', '卖出基金',
      '股票盈利', '股票赚钱', '炒股赚', '股票止盈', '止盈', '卖出盈利', '做T赚', '打新收益', '打新中签', '中签盈利', '新债中签', '可转债盈利', '期货盈利', '期货赚',
      '利息', '收利息', '存款利息', '定期利息', '活期利息', '国债利息', '逆回购收益', '债券收益', '余额宝收益', '零钱通收益', '朝朝宝收益',
      '黄金盈利', '黄金赚钱', '卖黄金', '卖金条', '黄金止盈'
    ],

    '数字资产': [
      '卖域名', '域名出售', '卖源码', '源码收入', '卖插件', '插件收入', '卖主题', '卖模板', '数字作品', '卖素材', '图片版权收入',
      '软件分成', 'App分成', '独立开发收入', '内购收入', '苹果结算', '广告分成', '流量主', '公众号收益', '自媒体收益', '创作激励', '视频收益', '播放量收益', '知识付费收入',
      '卖号', '游戏搬砖', '打金收入', '卖装备', '卖金币', '卖皮肤收入', '代练收入',
      '虚拟币盈利', '炒币赚', '卖币', '空投', '空投收益', '挖矿收益', '算力出租', 'NFT卖出', '数字藏品卖出'
    ],

    '兼职副业': [
      '兼职副业', '兼职', '副业', '外快', '赚外快', '私活', '接私活', '接单', '接单收入', '跑单',
      '稿费', '写稿', '投稿收入', '设计费', '做图收入', '修图费', '精修收入', '剪辑费', '视频剪辑收入',
      '约拍', '约拍收入', '摄影收入', '拍照收入', '跟拍收入', '妆造收入', '化妆收入', '试妆费', '相册定制收入',
      '专利撰写', '写专利', '咨询费', '技术支持费', '运维外快', '讲课费', '培训收入', '家教收入', '辅导费', '翻译费',
      '劳务费', '劳务报酬', '出场费', '评审费收入', '跑腿收入', '代驾收入', '顺风车收入', '摆摊', '摆摊收入', '代购赚', '闲鱼代拍'
    ],

    '奖金分红': [
      '奖金分红', '奖金', '发奖金', '年终奖', '双薪', '十三薪', '十四薪', '绩效', '绩效奖', '季度奖', '月度奖', '项目奖', '专项奖',
      '全勤奖', '优秀员工', '先进奖', '伯乐奖', '内推奖', '创新奖', '专利奖', '竞赛奖金', '比赛奖金',
      '提成', '销售提成', '业绩提成', '佣金收入', '推广佣金',
      '分红', '股息', '股票分红', '红利', '股东分红', '合伙分红', '年底分红', '店铺分红', '过节费', '开门红', '开工利是'
    ],

    '礼金人情': [
      '收红包', '抢红包', '收到红包', '微信红包收入', '领红包', '压岁钱收入', '收压岁钱', '收利是',
      '礼金收入', '收礼金', '份子钱收入', '收份子钱', '结婚收礼', '婚礼礼金', '满月收礼', '乔迁收礼', '生日红包', '过年红包', '七夕红包', '情人节红包', '520红包', '纪念日红包',
      '回礼', '收到回礼', '转账收入', '收到转账', '老婆给', '老公给', '对象给', '爸妈给', '父母给', '家里给', '长辈给', '零花钱收入', '生活费收入',
      '别人还钱', '还钱给我', '收回借款', '收欠款'
    ],

    '退款返还': [
      '退款返还', '退款返回', '退款', '收到退款', '退货', '退货退款', '仅退款', '退费', '退押金', '押金退回', '退租金', '退差价', '保价', '价保', '买贵退差', '取消订单',
      '报销', '报销款', '公司报销', '差旅报销', '出差报销', '发票报销', '打车报销', '餐费报销', '话费报销', '体检报销',
      '医保报销', '医疗报销', '生育津贴', '生育报销', '理赔', '保险理赔', '医疗险理赔', '车险理赔', '延误险', '运费险', '退运费',
      '退税', '个税退税', '汇算清缴退税', '返现', '刷卡返现', '信用卡返现', '立减金', '返利', '淘客返利', '返还', '补贴返回', '国补退回', '以旧换新退费', '薅羊毛', '羊毛'
    ],

    '其他收入': [
      '其他收入', '其它收入', '闲鱼卖出', '闲鱼回血', '闲鱼赚', '卖二手', '二手回血', '转卖', '出闲置', '卖废品', '卖纸箱', '手机回收', '回收款',
      '中奖', '彩票中奖', '刮刮乐中奖', '双色球', '大乐透', '抽奖中', '年会中奖',
      '捡钱', '捡到', '意外之财', '获赔', '收到赔偿', '违约金收入', '咸鱼卖出'
    ]
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
  .cb-check{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:5px 9px;border-radius:8px;cursor:pointer;
    border:1.5px solid var(--border-subtle,#ddd);background:var(--bg-subtle,#f5f5f5);color:var(--text-muted,#666);user-select:none}
  .cb-check.cb-checked{border-color:var(--primary,#3b82f6);background:rgba(59,130,246,.12);color:var(--primary,#3b82f6)}
  .cb-check input{width:15px;height:15px;margin:0;accent-color:var(--primary,#3b82f6);cursor:pointer}
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
        if (Array.isArray(favIds.value)) {
          const valid = favIds.value.map((id) => accs.find((a) => sameId(a.id, id))).filter(Boolean);
          if (valid.length || favIds.value.length === 0) return valid.slice(0, 3);
        }
        return accs.slice(0, 3);
      });
      const activeAccountId = ref(undefined); // undefined=未初始化；null=纯流水
      watch(() => props.accounts, (accs) => {
        if (activeAccountId.value === undefined && accs && accs.length) activeAccountId.value = favAccounts.value[0]?.id ?? accs[0]?.id ?? null;
        if (activeAccountId.value !== null && activeAccountId.value !== undefined && !(accs || []).some((a) => sameId(a.id, activeAccountId.value))) {
          activeAccountId.value = favAccounts.value[0]?.id ?? accs[0]?.id ?? null;
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
        if (ids.some((id) => sameId(id, acc.id))) {
          ids = ids.filter((id) => !sameId(id, acc.id));
        } else {
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
          <template v-if="otherActive"><img v-if="accIcon(otherActive)" :src="accIcon(otherActive)" alt=""><span>{{ otherActive.name }} ▾</span></template>
          <span v-else>+ 其他账户</span>
        </button>
      </div>

      <div class="cb-input">
        <textarea v-model="input" rows="1" placeholder="例如：昨天早饭10，晚饭30 / 收到工资8000" @keydown="onKeydown"></textarea>
        <button class="cb-send" :disabled="!input.trim()" @click="send">发送</button>
      </div>

      <div v-if="showPicker" class="cb-picker-mask" @click.self="showPicker = false">
        <div class="cb-picker">
          <div class="cb-picker-title"><span>选择账户 · 自定义常用 ({{ favAccounts.length }}/3)</span><button class="cb-close" @click="showPicker = false">×</button></div>
          <div class="cb-picker-tip">点击左侧切换当前入账账户；右侧勾选「☑ 常用」自定义输入框上方前 3 个常用账户</div>
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
            <label class="cb-check" :class="{ 'cb-checked': isFav(acc.id) }" @click.stop>
              <input type="checkbox" :checked="isFav(acc.id)" @change="toggleFav(acc)">
              <span>常用</span>
            </label>
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

// 常量与工具：与 internradar/config.py、models.py、parser.py 对齐。
export const PAGE_SIZE = 50;
export const CONFIDENCE_THRESHOLD = 0.6; // [TODO Q1] 4.2.4 解析置信度阈值
export const PARSE_TEXT_MAX_CHARS = 8000; // [TODO Q6]
export const SAMPLE_SET_MIN_SIZE = 10;
export const SAMPLE_SET_MAX_SIZE = 100;
export const ERROR_CASE_MAX = 5;
export const FEWSHOT_MIN_COUNT = 3;
export const FEWSHOT_MAX_COUNT = 5;
export const FEWSHOT_MIN_AGE_HOURS = 24;
export const PROMPT_VERSION_KEEP = 10;
export const NULL_RATE_TRIGGER = 0.2;
export const ACCURACY_TRIGGER = 0.7;
export const RELIABLE_LABEL_FIELDS = ['deadline', 'location', 'major_requirements'];
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export const POSITION_TYPE_VALUES = ['实习', '校招', '社招'];
export const COMPANY_NATURE_VALUES = ['外企', '国企', '民企', '事业单位'];
export const DEADLINE_PROXIMITY_VALUES = ['7 天内', '30 天内', '30 天以上', '无截止'];

export const APPLICATION_STATUS_LABELS = {
  saved: '已收藏',
  to_apply: '待投递',
  applied: '已投递',
  written_exam: '笔试',
  interview: '面试',
  offer: 'Offer',
  rejected: '挂掉',
  expired: '已截止',
};
export const APPLICATION_STATUS_ORDER = [
  'saved', 'to_apply', 'applied', 'written_exam', 'interview', 'offer', 'rejected', 'expired',
];
export const ALLOWED_APPLICATION_TRANSITIONS = {
  saved: ['to_apply', 'applied', 'expired'],
  to_apply: ['saved', 'applied', 'expired'],
  applied: ['written_exam', 'interview', 'offer', 'rejected', 'expired'],
  written_exam: ['interview', 'offer', 'rejected', 'expired'],
  interview: ['offer', 'rejected', 'expired'],
  offer: [],
  rejected: [],
  expired: [],
};

export const EDITABLE_FIELDS = [
  'company', 'position', 'location', 'position_type', 'is_intern',
  'major_requirements', 'apply_link', 'deadline', 'deadline_raw', 'direction', 'industry',
  'industry_source',
];
export const GOLD_FIELDS = [
  'company', 'position', 'location', 'position_type', 'is_intern',
  'major_requirements', 'apply_link', 'deadline', 'deadline_raw',
];
export const EVAL_FIELDS = GOLD_FIELDS;
export const KEY_FIELDS = [
  'company', 'position', 'location', 'position_type',
  'major_requirements', 'apply_link', 'deadline',
];

export const KIND_MODEL_COMPARISON = 'model_comparison';
export const KIND_PROMPT_COMPARISON = 'prompt_comparison';
export const NOTE_ABANDONED = '用户放弃运行';

// 职能方向收敛为 20 类，宁可空值也不硬套细分方向。
export const DIRECTION_GROUPS = [
  { group: '业务与职能', items: ['销售', '客服', '人力', '行政', '财务', '法务', '供应链', '运营', '市场', '产品'] },
  { group: '技术与数据', items: ['技术', '数据与算法', '设计'] },
  { group: '行业方向', items: ['生产制造', '工程建筑', '能源环保', '医药医疗', '教育科研', '传媒', '农林牧渔'] },
];
export const DIRECTIONS = DIRECTION_GROUPS.flatMap((entry) => entry.items);

// 规则推断关键词（顺序即优先级：明确的职能词优先于宽泛技术词）。
export const DIRECTION_KEYWORDS = {
  销售: ['销售', '客户经理', '客户发展', '业务代表', '业务员', '大客户', 'ka专员', 'ka经理', 'ka销售', '门店', '店长', '店员', '导购', '课程顾问', '外贸', '医药代表', '国际业务', '招商', '渠道合作', '商务拓展', 'bd'],
  客服: ['客服', '客户服务', '客户支持', '客户成功', '售后', '售后服务', '呼叫中心', '礼宾'],
  人力: ['人力', 'hr', 'hrbp', '招聘专员', '招聘经理', '招聘主管', '招聘助理', '招聘实习', '招聘官', '校招专员', '校招助理', '校园招聘专员', '薪酬', '人事', '培训发展', '组织发展'],
  行政: ['行政', '前台', '后勤', '办公支持', '总务', '综合管理', '会务', '接待', '文员', '秘书', '商务助理', '场地管理'],
  财务: ['财务', '会计', '出纳', '审计', '税务', '财税', '资金管理', '预算', '核算', '成本管理', '银行', '柜员', '信贷', '理财经理', '证券', '基金', '投行', '行研', '投资', '保险', '精算', '核保', '理赔'],
  法务: ['法务', '法律', '律师', '合规', '合同管理'],
  供应链: ['采购', '供应链', '供应商管理', '寻源', '物流', '仓储', '运输', '快递', '配送', '关务', '多式联运', '需求计划', 'pmc', '生产计划', '计划员', '跟单', '调度'],
  运营: ['运营', '营运', 'operation', '新媒体', '短视频', '抖音', '公众号', '直播', '电商', '内容编辑', '内容审核', '图文运营', '社群', '票务', '场控', '会员'],
  市场: ['市场', '营销', '推广', '品牌', '公关', '广告', '媒介', '媒体', '增长', '活动策划', '文案策划', '文案', '投放', '企划', '4a', '宣传', '邀约'],
  产品: ['产品经理', '产品助理', '产品专员', '产品策划', '产品实习生', '需求分析'],
  数据与算法: ['算法', '机器学习', '深度学习', '大模型', 'nlp', '计算机视觉', '推荐系统', '多模态', '数据开发', '数据工程', '数仓', 'etl', '大数据', '数据分析', '商业分析', '数据科学', '数据挖掘', '数据治理', '数据标注', '数据采集', '数采', '数据管理', '量化分析', '智能体', '人工智能'],
  技术: ['后端', '服务端', '后台开发', 'java', 'golang', 'go开发', 'python', 'c++', 'php', 'node', '软件工程师', '软件开发', '前端', 'web开发', 'javascript', 'typescript', 'vue', 'react', '小程序', 'h5', '安卓', 'android', 'ios', '移动端', '客户端', 'app开发', '测试', 'qa', '质量保障', '自动化测试', '运维', 'sre', 'devops', '系统维护', '云计算', '金融科技', '渗透', '漏洞', '信息安全', '等保', '嵌入式', '单片机', '固件', 'fpga', '驱动开发', 'rtos', '硬件', '电子工程', 'pcb', '电路', '芯片', '半导体', '集成电路', '通信', '无线', '基站', '光通信', '5g', '射频', '网络工程师', '信息技术', '网络安全', '技术担当', '技术储备', '技术岗', '技术员', '技术工程师', '技术管培', 'sap', 'erp'],
  设计: ['设计师', '视觉设计', '平面设计', '品牌视觉', 'ui设计', '交互', 'ux', '用户体验', '用户研究', '工业设计', '产品设计', '室内设计', '艺术设计', '服装设计', '美工', '建模', '绘图'],
  教育科研: ['教师', '老师', '讲师', '主讲', '助教', '教研', '教务', '教学', '课程', '家教', '教育', '学校', '学院', '小学', '初中', '高中', '辅导员', '教练', '辅导', '伴学', '博士后', '职业培训', '培训机构', '科研', '课题研究'],
  医药医疗: ['医药', '制药', '药业', '药学', '中药', '药物', '临床', '医师', '护理', '康复', '医疗器械', '医用设备', '体外诊断', 'ivd', '介入', '生物', '医院', '诊所', '医疗', '口腔', '公共卫生', '预防医学', '检验'],
  传媒: ['传媒', '影视', '出版', '新闻', '记者', '编辑', '采编', '摄影', '剪辑', '主播', '融媒体', '编导'],
  农林牧渔: ['农学', '农业', '畜牧', '兽医', '林业', '水产', '种植', '园艺', '植保', '饲料', '农牧'],
  工程建筑: ['建筑', '土木', '结构工程', '施工', '监理', '造价', '暖通', '给排水', '测绘', '地质', '勘探', '水利', '市政', '桥梁', '道路', '城乡规划', '景观设计', '建筑设计', '工程管理', '工程实习', '项目管理', 'pmo'],
  能源环保: ['能源', '电力', '电网', '光伏', '风电', '储能', '核电', '环境', '环保', '环评', '生态', '水处理', '碳排放', '双碳', '固废', '绿材', 'ehs', '安全工程', '安全生产', '消防', '职业健康', '安环'],
  生产制造: ['生产', '制造', '工艺', '机械', '机电', '模具', '数控', 'cnc', '设备', '电气', '自动化', 'plc', '控制系统', '仪表', '供配电', '焊接', '焊工', '铆工', '装配', '车间', '产线', '操作工', '普工', '技工', '操作员', '质量工程师', '质检', '品质', 'iqc', '品管', '材料', '冶金', '高分子', '复合材料', '化工', '化学工程', '催化', '车辆', '整车', '汽车', '动力总成', '底盘', '新能源车', '电池', '电梯', '五金'],
};

// 来源名称收敛到站点官方简称，避免同一来源在列表里出现多个名字。
export const SOURCE_NAME_ALIASES = {
  应届生求职网专业频道: '应届生求职网',
  '应届生求职网（专业频道）': '应届生求职网',
  '应届生求职网(专业频道)': '应届生求职网',
  国家大学生就业服务平台: '国家大学生就业服务平台',
  '新职业网': '国家大学生就业服务平台',
  国聘网: '国聘',
  '国聘（国资央企招聘平台）': '国聘',
};

export function canonicalSourceName(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  return SOURCE_NAME_ALIASES[text] || text;
}

export const INDUSTRIES = [
  '互联网/软件', '人工智能', '通信', '电子/半导体', '计算机硬件', '金融', '银行',
  '证券/基金', '保险', '制造', '汽车', '机械/装备', '能源/电力', '化工', '材料',
  '建筑/地产', '工程承包', '交通/物流', '医药/医疗', '生物科技', '农业', '食品',
  '消费/零售', '电商', '教育培训', '文化传媒', '广告/公关', '咨询', '旅游/酒店',
  '餐饮', '房地产服务', '公共部门', '社会组织', '其他',
];

export const INDUSTRY_KEYWORDS = {
  '互联网/软件': ['互联网', '软件', '信息技术', '信息科技', '信息发展', '网络科技', '数据科技', '云计算'],
  人工智能: ['人工智能', '大模型', '数据智能'],
  通信: ['通信', '电信', '铁塔', '网络服务'],
  '电子/半导体': ['电子', '半导体', '芯片', '集成电路', '微电子', '光电', '连接器', '电路', '光刻'],
  计算机硬件: ['计算机硬件', '服务器', '终端设备'],
  银行: ['银行', '农商', '信用社'],
  '证券/基金': ['证券', '基金', '投资管理', '资管', '期货', '私募'],
  保险: ['保险', '再保险'],
  金融: ['金融', '支付', '信贷', '融资租赁', '金融科技', '担保', '信托', '资本运营'],
  汽车: ['汽车', '整车', '零部件', '轮胎', '新能源车', '车联网'],
  '机械/装备': ['机械', '装备', '机床', '电梯', '五金', '智能设备', '机电'],
  制造: ['制造', '工厂', '产线', '代工', '精密', '包装', '电器'],
  '能源/电力': ['能源', '电力', '电网', '石油', '石化', '燃气', '新能源', '储能', '光伏', '风电'],
  化工: ['化工', '化学', '涂料', '橡胶', '化肥', '树脂', '环氧'],
  材料: ['材料', '冶金', '高分子', '复合', '钢研'],
  '建筑/地产': ['建筑', '地产', '房地产', '建设', '装饰', '装修', '建材'],
  工程承包: ['工程局', '施工', '总承包', '勘察设计', '勘测设计', '设计院', '水利', '工程技术服务'],
  '交通/物流': ['物流', '货运', '快递', '航运', '航空', '轨道', '运输', '客运', '铁路'],
  '医药/医疗': ['医药', '制药', '药业', '药房', '生物制品', '医疗器械', '医院', '诊所', '医疗', '健康'],
  生物科技: ['生物', '基因', '细胞', '合成生物'],
  农业: ['农业', '种业', '畜牧', '饲料', '农垦', '农牧'],
  食品: ['食品', '饮料', '乳品', '乳业', '茶业', '酒业', '酒类'],
  '消费/零售': ['零售', '消费', '快消', '商贸', '贸易', '百货', '服饰', '个人用品', '商店', '家居', '免税'],
  电商: ['电商', '跨境电商', '平台商家'],
  教育培训: ['教育', '学校', '学院', '职教', '产教融合', '中学', '小学', '汉语', '培训机构', '职业培训', '培训学校'],
  '广告/公关': ['广告', '公关', '媒介', '营销服务', '推广服务'],
  文化传媒: ['传媒', '文化', '影视', '出版', 'mcn', '游戏', '融媒体'],
  咨询: ['咨询', '人力资源', '会计事务所', '律师事务所', '管理顾问', '检测', '认证'],
  '旅游/酒店': ['旅游', '酒店', '景区', '会展', '民宿', '旅行'],
  餐饮: ['餐饮', '连锁', '团餐'],
  房地产服务: ['物业', '经纪', '房产服务', '商业经营'],
  社会组织: ['协会', '基金会', '联合会', '学会'],
  公共部门: ['政府', '事业单位', '机关', '公共服务'],
};

// 大学专业目录（学科门类 → 专业类，按教育部本科专业目录）：采集条件筛选与专业要求匹配用。
// 每项 = [专业类名称, 匹配关键词, 应届生求职网专业频道目录]。
export const MAJOR_GROUPS = [
  {
    group: '哲学',
    majors: [
      ['哲学类', ['哲学', '逻辑学', '宗教学'], 'wenke'],
    ],
  },
  {
    group: '经济学',
    majors: [
      ['经济学类', ['经济学', '经济', '政治经济学'], 'jinrong'],
      ['财政学类', ['财政', '税收', '税务'], 'jinrong'],
      ['金融学类', ['金融', '投资学', '保险', '银行'], 'jinrong'],
      ['经济与贸易类', ['国际经济与贸易', '贸易经济', '国贸'], 'jinrong'],
    ],
  },
  {
    group: '法学',
    majors: [
      ['法学类', ['法学', '法律'], 'falv'],
      ['政治学类', ['政治学', '国际政治', '外交学'], 'wenke'],
      ['社会学类', ['社会学', '社会工作', '人类学'], 'wenke'],
      ['民族学类', ['民族学'], 'wenke'],
      ['马克思主义理论类', ['马克思主义', '思想政治教育', '思政'], 'wenke'],
      ['公安学类', ['公安', '侦查', '治安', '边防管理'], 'falv'],
    ],
  },
  {
    group: '教育学',
    majors: [
      ['教育学类', ['教育学', '学前教育', '小学教育', '特殊教育', '教育技术'], 'jiaoshi'],
      ['体育学类', ['体育', '运动训练', '社会体育', '民族传统体育'], 'jiaoshi'],
    ],
  },
  {
    group: '文学',
    majors: [
      ['中国语言文学类', ['汉语言文学', '中文', '汉语国际教育', '秘书学'], 'wenke'],
      ['外国语言文学类', ['英语', '日语', '韩语', '俄语', '德语', '法语', '西班牙语', '翻译', '商务英语', '小语种', '外语'], 'waiyu'],
      ['新闻传播学类', ['新闻学', '传播学', '广告学', '编辑出版', '网络与新媒体'], 'meiti'],
    ],
  },
  {
    group: '历史学',
    majors: [
      ['历史学类', ['历史学', '世界史', '考古学', '文物与博物馆'], 'wenke'],
    ],
  },
  {
    group: '理学',
    majors: [
      ['数学类', ['数学', '应用数学', '计算数学', '信息与计算科学'], 'shuxue'],
      ['物理学类', ['物理学', '应用物理', '光学'], 'wuli'],
      ['化学类', ['化学', '应用化学', '化学测量'], 'huaxue'],
      ['天文学类', ['天文学'], 'dili'],
      ['地理科学类', ['地理', '自然地理', '人文地理', '资源环境'], 'dili'],
      ['大气科学类', ['大气', '气象'], 'dili'],
      ['海洋科学类', ['海洋科学', '海洋技术'], 'chuanbo'],
      ['地球物理学类', ['地球物理', '空间科学'], 'dili'],
      ['地质学类', ['地质学', '地球化学'], 'dili'],
      ['生物科学类', ['生物科学', '生物技术', '生态学'], 'shengwu'],
      ['心理学类', ['心理学', '应用心理'], 'jiaoshi'],
      ['统计学类', ['统计', '应用统计', '数据统计'], 'shuxue'],
    ],
  },
  {
    group: '工学',
    majors: [
      ['计算机类', ['计算机', '软件工程', '网络工程', '信息安全', '物联网', '数据科学与大数据', '人工智能'], 'jisuanji'],
      ['电子信息类', ['电子信息', '通信工程', '电子科学', '微电子', '集成电路', '光电信息'], 'tongxin'],
      ['电气类', ['电气', '电力系统', '智能电网'], 'dianli'],
      ['自动化类', ['自动化', '机器人工程', '测控技术', '智能制造'], 'zidonghua'],
      ['仪器类', ['仪器', '精密测量'], 'zidonghua'],
      ['机械类', ['机械', '机电', '车辆工程', '工业设计', '制造工程'], 'jixie'],
      ['力学类', ['力学', '工程力学'], 'lixue'],
      ['材料类', ['材料', '冶金', '高分子', '纳米'], 'cailiao'],
      ['能源动力类', ['能源', '动力工程', '热能', '新能源科学'], 'dongli'],
      ['土木类', ['土木', '建筑工程', '道路桥梁', '地下空间', '给排水'], 'jianzhu'],
      ['建筑类', ['建筑学', '城乡规划', '风景园林'], 'jianzhu'],
      ['水利类', ['水利', '水务', '港口航道'], 'jianzhu'],
      ['测绘类', ['测绘', '地理信息科学', '遥感'], 'dili'],
      ['化工与制药类', ['化学工程', '工艺', '制药工程', '精细化工', '能源化学'], 'huaxue'],
      ['地质类', ['地质工程', '勘查', '资源勘探'], 'dili'],
      ['矿业类', ['矿业', '采矿', '安全工程', '石油工程'], 'dili'],
      ['纺织类', ['纺织', '服装设计与工程', '非织造'], 'fuzhuang'],
      ['轻工类', ['轻工', '包装工程', '印刷', '造纸'], 'cailiao'],
      ['交通运输类', ['交通运输', '交通信息', '物流工程', '汽车服务'], 'wuliu'],
      ['海洋工程类', ['海洋工程', '船舶', '航海技术'], 'chuanbo'],
      ['航空航天类', ['航空', '航天', '飞行器', '空天科学'], 'jixie'],
      ['兵器类', ['兵器', '武器系统'], 'jixie'],
      ['核工程类', ['核工程', '核技术', '辐射防护'], 'dongli'],
      ['农业工程类', ['农业工程', '农业机械化', '水利方向'], 'nonglin'],
      ['林业工程类', ['林业工程', '木材科学', '林产化工'], 'nonglin'],
      ['环境科学与工程类', ['环境科学', '环境工程', '环保设备'], 'huanjing'],
      ['生物医学工程类', ['生物医学工程', '医疗器械', '医学影像工程'], 'shengwu'],
      ['食品科学与工程类', ['食品科学', '食品质量与安全', '粮食工程', '乳品'], 'shengwu'],
      ['安全科学与工程类', ['安全工程', '应急', '职业健康'], 'huanjing'],
      ['生物工程类', ['生物工程', '生物制药', '合成生物'], 'shengwu'],
      ['公安技术类', ['刑事科学技术', '消防工程', '网络安全与执法'], 'falv'],
    ],
  },
  {
    group: '农学',
    majors: [
      ['植物生产类', ['农学', '植物保护', '园艺', '种子', '茶学', '烟草'], 'nonglin'],
      ['自然保护与环境生态类', ['森林保护', '湿地保护', '生态恢复'], 'nonglin'],
      ['动物生产类', ['动物科学', '畜牧', '草业科学'], 'nonglin'],
      ['动物医学类', ['动物医学', '兽医'], 'nonglin'],
      ['林学类', ['林学', '园林', '森林'], 'nonglin'],
      ['水产类', ['水产', '渔业'], 'nonglin'],
      ['草学类', ['草业'], 'nonglin'],
    ],
  },
  {
    group: '医学',
    majors: [
      ['基础医学类', ['基础医学', '预防医学'], 'yixue'],
      ['临床医学类', ['临床医学', '儿科', '精神医学', '全科医学'], 'yixue'],
      ['口腔医学类', ['口腔'], 'yixue'],
      ['公共卫生与预防医学类', ['公共卫生', '预防医学', '流行病学', '劳动卫生'], 'yixue'],
      ['中医学类', ['中医', '针灸', '推拿', '民族医学'], 'yixue'],
      ['中西医结合类', ['中西医结合'], 'yixue'],
      ['药学类', ['药学', '临床药学', '药物制剂', '药事管理'], 'yixue'],
      ['中药学类', ['中药', '中药资源'], 'yixue'],
      ['法医学类', ['法医'], 'yixue'],
      ['医学技术类', ['医学技术', '影像技术', '检验', '康复治疗'], 'yixue'],
      ['护理学类', ['护理'], 'yixue'],
    ],
  },
  {
    group: '管理学',
    majors: [
      ['管理科学与工程类', ['管理科学', '信息管理与信息系统', '工程管理', '工业工程', '运营'], 'guanli'],
      ['工商管理类', ['工商管理', '市场营销', '会计学', '财务管理', '人力资源管理', '审计'], 'guanli'],
      ['农业经济管理类', ['农林经济', '农村区域发展'], 'guanli'],
      ['公共管理类', ['公共事业管理', '行政管理', '劳动与社会保障', '土地资源管理'], 'guanli'],
      ['图书情报与档案管理类', ['图书馆', '情报', '档案', '信息资源管理'], 'guanli'],
      ['物流管理与工程类', ['物流管理', '供应链', '采购'], 'wuliu'],
      ['电子商务类', ['电子商务', '跨境电商'], 'guanli'],
      ['旅游管理类', ['旅游管理', '酒店管理', '会展经济'], 'guanli'],
    ],
  },
  {
    group: '艺术学',
    majors: [
      ['艺术学理论类', ['艺术史', '艺术管理', '艺术理论'], 'meishu'],
      ['音乐与舞蹈学类', ['音乐', '舞蹈', '声乐', '器乐'], 'meishu'],
      ['戏剧与影视学类', ['戏剧', '影视', '广播电视', '动画', '录音'], 'meiti'],
      ['美术学类', ['美术', '绘画', '书法', '雕塑'], 'meishu'],
      ['设计学类', ['设计', '视觉传达', '环境设计', '产品设计', '服装与服饰设计'], 'meishu'],
    ],
  },
  {
    group: '交叉学科',
    majors: [
      ['集成电路科学与工程类', ['集成电路', '芯片设计'], 'tongxin'],
      ['智能科学与技术类', ['智能科学', '机器人', '具身智能'], 'jisuanji'],
      ['数字经济类', ['数字经济'], 'jinrong'],
      ['储能科学与工程类', ['储能', '电池'], 'dongli'],
    ],
  },
];

export const MAJORS = MAJOR_GROUPS.flatMap((entry) => entry.majors.map(([name]) => name));

const MAJOR_META = new Map(MAJOR_GROUPS.flatMap((entry) => entry.majors.map(([name, terms, yjs]) => [name, { group: entry.group, terms, yjs }])));

export function majorMeta(name) {
  return MAJOR_META.get(name) || null;
}

// 应届生求职网专业频道目录；未识别的专业回退到「专业不限」。
export function yjsMajorDir(name) {
  return majorMeta(name)?.yjs || 'buxian';
}

// 专业是否与岗位专业要求文本匹配（空关键词表示不限专业）。
export function majorMatches(text, name) {
  if (!name) return true;
  const haystack = String(text || '').toLowerCase();
  const meta = majorMeta(name);
  if (!meta) return false;
  if (meta.terms.includes('专业不限')) return true;
  return meta.terms.some((term) => haystack.includes(String(term).toLowerCase()));
}

// 采集意向城市：源站地区参数（国家平台 areaCode）与应届生频道目录。
export const COLLECT_CITIES = [
  { name: '北京', areaCode: '110100', yjs: 'beijing' },
  { name: '上海', areaCode: '310100', yjs: 'shanghai' },
  { name: '广州', areaCode: '440100', yjs: 'guangzhou' },
  { name: '深圳', areaCode: '440300', yjs: 'shenzhen' },
  { name: '杭州', areaCode: '330100', yjs: 'other' },
  { name: '成都', areaCode: '510100', yjs: 'chengdu' },
  { name: '武汉', areaCode: '420100', yjs: 'wuhan' },
  { name: '南京', areaCode: '320100', yjs: 'nanjing' },
  { name: '天津', areaCode: '120100', yjs: 'tianjin' },
  { name: '重庆', areaCode: '500100', yjs: 'other' },
  { name: '西安', areaCode: '610100', yjs: 'other' },
  { name: '苏州', areaCode: '320500', yjs: 'other' },
  { name: '长沙', areaCode: '430100', yjs: 'other' },
  { name: '郑州', areaCode: '410100', yjs: 'other' },
  { name: '青岛', areaCode: '370200', yjs: 'other' },
  { name: '沈阳', areaCode: '210100', yjs: 'other' },
  { name: '大连', areaCode: '210200', yjs: 'other' },
  { name: '厦门', areaCode: '350200', yjs: 'other' },
  { name: '合肥', areaCode: '340100', yjs: 'other' },
  { name: '昆明', areaCode: '530100', yjs: 'other' },
  { name: '哈尔滨', areaCode: '230100', yjs: 'other' },
  { name: '济南', areaCode: '370100', yjs: 'other' },
  { name: '长春', areaCode: '220100', yjs: 'other' },
  { name: '南昌', areaCode: '360100', yjs: 'other' },
  { name: '贵阳', areaCode: '520100', yjs: 'other' },
  { name: '南宁', areaCode: '450100', yjs: 'other' },
  { name: '福州', areaCode: '350100', yjs: 'other' },
  { name: '太原', areaCode: '140100', yjs: 'other' },
  { name: '石家庄', areaCode: '130100', yjs: 'other' },
  { name: '兰州', areaCode: '620100', yjs: 'other' },
  { name: '乌鲁木齐', areaCode: '650100', yjs: 'other' },
  { name: '呼和浩特', areaCode: '150100', yjs: 'other' },
  { name: '银川', areaCode: '640100', yjs: 'other' },
  { name: '西宁', areaCode: '630100', yjs: 'other' },
  { name: '拉萨', areaCode: '540100', yjs: 'other' },
  { name: '海口', areaCode: '460100', yjs: 'other' },
  { name: '东莞', areaCode: '441900', yjs: 'other' },
  { name: '宁波', areaCode: '330200', yjs: 'other' },
  { name: '佛山', areaCode: '440600', yjs: 'other' },
  { name: '无锡', areaCode: '320200', yjs: 'other' },
  { name: '远程/不限', areaCode: '', yjs: 'other' },
];

const CITY_META = new Map(COLLECT_CITIES.map((city) => [city.name, city]));

export function cityMeta(keyword) {
  const text = String(keyword || '').trim();
  if (!text) return null;
  if (CITY_META.has(text)) return CITY_META.get(text);
  const bare = text.replace(/市$/, '');
  if (CITY_META.has(bare)) return CITY_META.get(bare);
  for (const city of CITY_META.values()) {
    if (city.name !== '远程/不限' && (text.includes(city.name) || city.name.includes(text))) return city;
  }
  return null;
}

// 站点 LLM 配置自检：只暴露布尔与原因码，不回显任何密钥内容。
export function siteLlmStatus() {
  const apiBase = env('INTERNRADAR_LLM_API_BASE');
  const apiKey = env('INTERNRADAR_LLM_API_KEY');
  if (!apiBase) return { ready: false, reason: 'missing_api_base', message: '站点未配置 LLM 接口地址（INTERNRADAR_LLM_API_BASE）。' };
  if (!/^https?:\/\/\S+$/i.test(apiBase)) return { ready: false, reason: 'invalid_api_base', message: '站点 LLM 接口地址不是合法的 http(s) URL，请在 Site 设置中修正。' };
  if (!apiKey) return { ready: false, reason: 'missing_api_key', message: '站点未配置 LLM 密钥（INTERNRADAR_LLM_API_KEY）。' };
  return { ready: true, reason: '', message: '' };
}

// 4.2.3 初始生产 prompt（与 prompt_evolution.BASE_PROMPT_V1 一致）
export const BASE_PROMPT_V1 = `你是一个实习/校招岗位信息抽取助手。请从给定的网页纯文本中抽取岗位信息，严格输出一个 JSON 对象，不要输出任何解释或其他内容。

输出字段约定（字段缺失填 null，不允许缺失字段本身）：
{
  "company": "string|null",
  "position": "string|null",
  "location": "string|null",
  "position_type": "实习|校招|社招|null",
  "is_intern": true|false|null,
  "major_requirements": "string|null",
  "apply_link": "string|null",
  "deadline": "YYYY-MM-DD|null",
  "deadline_raw": "string|null",
  "confidence": 0.0
}

规则：
1. position_type 只能取「实习」「校招」「社招」之一，无法判断填 null。
2. is_intern：根据上下文判断该岗位是否为实习岗位。
3. confidence：你对本次解析结果的整体把握，0.0–1.0；company 与 position 均无法抽取时置 0.0。
4. 截止日期：绝对日期（如「2026 年 6 月 30 日」「6/30/2026」）转为 YYYY-MM-DD 填入 deadline；相对日期（如「本月底」「下周五」）填入 deadline_raw 并将 deadline 置 null；无明确截止时间则两者均为 null。
5. major_requirements 摘录专业要求原文；apply_link 为投递链接、邮箱或表单地址。`;

export const PARSE_OUTPUT_SCHEMA = [
  'company', 'position', 'location', 'position_type', 'is_intern',
  'major_requirements', 'apply_link', 'deadline', 'deadline_raw', 'confidence',
];

// [TODO Q6] 候选模型来自 config/experiment_config.yaml
export const EXPERIMENT_MODELS = ['qwen-max-v2', 'doubao-lite-32k'];
export const EXPERIMENT_DEFAULTS = { temperature: 0, maxTokens: 2048, pricePer1kTokens: null };

// 公开实验额度：解析统一消耗站点 LLM 额度，按日总量限制。
export const PUBLIC_SITE_DAILY_CALL_LIMIT = 300;
export const PUBLIC_SITE_MAX_SAMPLES = 20;
export const PUBLIC_SITE_MAX_MODELS = 2;
export const LLM_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class LlmError extends Error {}

export function env(name) {
  try {
    return (Deno.env.get(name) ?? '').trim();
  } catch {
    return '';
  }
}

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function isoSeconds(date = new Date()) {
  return date.toISOString().slice(0, 19) + 'Z';
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function displayMoment(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new Error('invalid_input');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_input');
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('payload_too_large');
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('invalid_input');
  }
}

export function optText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function parseBoolLike(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', '是'].includes(text)) return true;
  if (['false', '0', '否'].includes(text)) return false;
  return null;
}

export function toBool(value) {
  return value === true || value === 1 || value === '1';
}

const INVISIBLE_RE = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_RE = /<\/(p|div|li|tr|h[1-6])>|<br\s*\/?>/gi;
const TAG_RE = /<[^>]+>/g;
const PRIORITY_KEYWORDS = ['实习', '运维', '数据', '招聘', '截止'];

export function stripHtmlText(rawText) {
  const text = String(rawText || '')
    .replace(INVISIBLE_RE, ' ')
    .replace(BLOCK_RE, '\n')
    .replace(TAG_RE, '');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function preprocess(rawText) {
  const stripped = stripHtmlText(rawText);
  if (stripped.length <= PARSE_TEXT_MAX_CHARS) return stripped;
  const lines = stripped.split('\n');
  let budget = PARSE_TEXT_MAX_CHARS;
  const kept = new Set();
  lines.forEach((line, index) => {
    if (PRIORITY_KEYWORDS.some((keyword) => line.includes(keyword)) && line.length + 1 <= budget) {
      kept.add(index);
      budget -= line.length + 1;
    }
  });
  for (let index = 0; index < lines.length; index += 1) {
    if (kept.has(index)) continue;
    const line = lines[index];
    if (line.length + 1 <= budget) {
      kept.add(index);
      budget -= line.length + 1;
    } else {
      break;
    }
  }
  return [...kept].sort((a, b) => a - b).map((index) => lines[index]).join('\n');
}

export function validateLlmOutput(data) {
  const missing = PARSE_OUTPUT_SCHEMA.filter((key) => !(key in data));
  if (missing.length) throw new Error(`LLM 返回缺少约定字段：${missing.join('、')}`);
  const positionType = data.position_type;
  if (positionType !== null && positionType !== undefined && !POSITION_TYPE_VALUES.includes(positionType)) {
    data.position_type = null;
  }
}

export function normalizeDeadline(data) {
  const deadline = data.deadline;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))) {
    if (!data.deadline_raw) data.deadline_raw = String(deadline);
    data.deadline = null;
  }
}

export function inferDirection(...texts) {
  // 站点标题常用「2027招聘XX」表示届别，不是 HR 招聘职能，去掉前缀避免命中「招聘助理」等关键词。
  const haystacks = texts
    .filter(Boolean)
    .map((text) => String(text).toLowerCase().replace(/20\d{2}\s*招聘/g, ''));
  if (!haystacks.length) return null;
  // 岗位标题优先：专业/公司名只在前面的文本没有任何命中时才参与判断，
  // 避免「人力资源实习生 + 机械专业」被误判成机械工程。
  for (const haystack of haystacks) {
    for (const [direction, keywords] of Object.entries(DIRECTION_KEYWORDS)) {
      if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return direction;
    }
  }
  return '其他';
}

export function inferIndustry(...texts) {
  const haystacks = texts.filter(Boolean).map((text) => String(text).toLowerCase());
  if (!haystacks.length) return null;
  for (const haystack of haystacks) {
    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return industry;
    }
  }
  return '其他';
}

export function directionGroupOf(direction) {
  if (!direction) return null;
  const group = DIRECTION_GROUPS.find((entry) => entry.items.includes(direction));
  return group ? group.group : null;
}

export function classifyDirection(...texts) {
  const inferred = inferDirection(...texts);
  const value = inferred === '其他' ? null : inferred;
  return { value, group: directionGroupOf(value) };
}

// 行业优先级：来源明确字段 > 人工维护关键词（公司名 + 岗位名）> 空值。
// 空值在 UI 显示「行业未标注」，不允许用宽泛规则硬填「其他」。
export function classifyIndustry(company, position, sourceIndustry = null) {
  const source = String(sourceIndustry || '').trim();
  if (source && source !== '其他') return { value: source, source: 'source' };
  const haystacks = [company, position]
    .filter(Boolean)
    // 「科学院」不是教育机构，避免被「学院」子串误判为教育培训（中国科学院大学仍算教育）。
    .map((text) => String(text).toLowerCase().replace(/科学院(?!大学)/g, '科研机构'));
  if (!haystacks.length) return { value: null, source: null };
  for (const haystack of haystacks) {
    for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
      if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
        return { value: industry, source: 'rule' };
      }
    }
  }
  return { value: null, source: null };
}

const CITY_NAMES = COLLECT_CITIES
  .map((city) => city.name)
  .filter((name) => name && name !== '远程/不限')
  .sort((a, b) => b.length - a.length);

function normalizeCityToken(token) {
  const text = String(token || '').trim().replace(/^[,，、/|;；\s]+|[,，、/|;；\s]+$/g, '');
  if (!text) return null;
  if (/远程|不限|全国/.test(text)) return '远程/不限';
  const hit = CITY_NAMES.find((name) => text.includes(name));
  if (hit) return hit;
  return text.replace(/市$/, '') || null;
}

export function splitCities(location) {
  const text = String(location || '').trim();
  if (!text) return [];
  const tokens = text
    .split(/[\/、，,;；|]+/)
    .map(normalizeCityToken)
    .filter(Boolean);
  return [...new Set(tokens)];
}

const PROVINCE_ONLY = new Set([
  '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
  '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
  '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆',
]);

// 采集城市清单只覆盖主要城市；这里按省份补齐地级市，用于把省级地址细化到城市。
const CITIES_BY_PROVINCE = {
  北京: '北京',
  上海: '上海',
  天津: '天津',
  重庆: '重庆',
  广东: '广州 深圳 韶关 珠海 汕头 佛山 江门 湛江 茂名 肇庆 惠州 梅州 汕尾 河源 阳江 清远 东莞 中山 潮州 揭阳 云浮',
  浙江: '杭州 宁波 温州 嘉兴 湖州 绍兴 金华 衢州 舟山 台州 丽水 义乌 慈溪 余姚 诸暨 温岭',
  江苏: '南京 无锡 徐州 常州 苏州 南通 连云港 淮安 盐城 扬州 镇江 泰州 宿迁 昆山 江阴 常熟 张家港',
  山东: '济南 青岛 淄博 枣庄 东营 烟台 潍坊 济宁 泰安 威海 日照 临沂 德州 聊城 滨州 菏泽',
  河南: '郑州 开封 洛阳 平顶山 安阳 新乡 焦作 许昌 漯河 南阳 商丘 信阳 周口 驻马店',
  河北: '石家庄 唐山 秦皇岛 邯郸 保定 张家口 承德 沧州 廊坊 衡水',
  福建: '福州 厦门 莆田 三明 泉州 漳州 南平 龙岩 宁德 晋江',
  湖南: '长沙 株洲 湘潭 衡阳 邵阳 岳阳 常德 张家界 益阳 郴州 永州 怀化 娄底',
  湖北: '武汉 黄石 十堰 宜昌 襄阳 荆门 孝感 荆州 黄冈 咸宁 随州',
  四川: '成都 自贡 攀枝花 泸州 德阳 绵阳 广元 遂宁 内江 乐山 南充 眉山 宜宾 达州 雅安 资阳',
  安徽: '合肥 芜湖 蚌埠 淮南 马鞍山 淮北 铜陵 安庆 黄山 滁州 阜阳 宿州 六安 亳州 宣城',
  江西: '南昌 景德镇 萍乡 九江 新余 鹰潭 赣州 吉安 宜春 抚州 上饶',
  广西: '南宁 柳州 桂林 梧州 北海 防城港 钦州 贵港 玉林 百色 贺州 河池 来宾 崇左',
  云南: '昆明 曲靖 玉溪 保山 昭通 丽江 普洱 临沧',
  贵州: '贵阳 六盘水 遵义 安顺 毕节 铜仁',
  陕西: '西安 铜川 宝鸡 咸阳 渭南 延安 汉中 榆林 安康 商洛',
  山西: '太原 大同 阳泉 长治 晋城 晋中 运城 临汾 吕梁',
  辽宁: '沈阳 大连 鞍山 抚顺 本溪 丹东 锦州 营口 阜新 辽阳 盘锦 铁岭 朝阳 葫芦岛',
  吉林: '长春 四平 辽源 通化 白山 松原 白城',
  黑龙江: '哈尔滨 齐齐哈尔 大庆 牡丹江 佳木斯 鸡西 鹤岗 双鸭山 伊春 七台河 黑河 绥化',
  内蒙古: '呼和浩特 包头 乌海 赤峰 通辽 鄂尔多斯 呼伦贝尔',
  甘肃: '兰州 嘉峪关 金昌 白银 天水 武威 张掖 平凉 酒泉 庆阳 定西 陇南',
  新疆: '乌鲁木齐 克拉玛依 吐鲁番 哈密',
  海南: '海口 三亚 儋州',
  宁夏: '银川 石嘴山 吴忠 固原 中卫',
  青海: '西宁 海东',
  西藏: '拉萨 日喀则 昌都 林芝',
};

const CITY_PROVINCE = new Map();
const CITY_NAME_INDEX = [];
for (const [province, names] of Object.entries(CITIES_BY_PROVINCE)) {
  for (const name of names.split(/\s+/).filter(Boolean)) {
    if (!CITY_PROVINCE.has(name)) CITY_PROVINCE.set(name, province);
    CITY_NAME_INDEX.push(name);
  }
}
CITY_NAME_INDEX.sort((a, b) => b.length - a.length);

function cityInText(text, province) {
  for (const name of CITY_NAME_INDEX) {
    if (text.includes(name) && CITY_PROVINCE.get(name) === province) return name;
  }
  return '';
}

// 列表页只给到省级时，用标题或公司括号里的同名城市细化；城市必须与省份一致，
// 避免「润欣（深圳）但岗位在云南」这类公司注册地覆盖真实工作地。
export function refineCityFromTitle(location, title, company = '') {
  const text = String(location || '').trim();
  if (!PROVINCE_ONLY.has(text)) return location;
  const titleText = String(title || '');
  const bracketRe = /[（(]([^）)]*)[）)]/g;
  for (const match of titleText.matchAll(bracketRe)) {
    const hit = cityInText(match[1], text);
    if (hit) return hit;
  }
  const body = titleText.replace(bracketRe, ' ').trim();
  for (const name of CITY_NAME_INDEX) {
    if (!body.startsWith(name) || CITY_PROVINCE.get(name) !== text) continue;
    // 「中山路店长」是道路名，不是中山市，排除街区道路等后缀。
    if (/^[路街巷区县镇乡村道]/.test(body.slice(name.length))) continue;
    return name;
  }
  const companyText = String(company || '');
  for (const match of companyText.matchAll(bracketRe)) {
    const hit = cityInText(match[1], text);
    if (hit) return hit;
  }
  const companyBody = companyText.replace(bracketRe, ' ').trim();
  for (const name of CITY_NAME_INDEX) {
    if (!companyBody.startsWith(name) || CITY_PROVINCE.get(name) !== text) continue;
    if (/^[路街巷区县镇乡村道]/.test(companyBody.slice(name.length))) continue;
    return name;
  }
  return location;
}

const SALARY_NUM_RE = /(\d+(?:\.\d+)?)\s*(k|千|万)?/gi;

function salaryNumber(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (unit === 'k' || unit === '千') return Math.round(number * 1000);
  if (unit === '万') return Math.round(number * 10000);
  return number;
}

// 薪资只做结构化拆解，不改写原文；无法识别的文本保留 raw 并标记 unparsed。
export function parseSalary(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/面议|待定|薪资面谈|negotiable/i.test(raw)) {
    return { raw, min: null, max: null, unit: null, negotiable: true, monthsPerYear: null, parsed: true };
  }
  const text = raw.replace(/[,，]/g, '').replace(/\s+/g, '');
  const periodMatch = text.match(/(?:元|块)?\s*\/\s*(天|日|小时|时|周|月|年)/)
    || text.match(/(天|日|小时|时|周|月|年)\s*薪/);
  const period = periodMatch ? periodMatch[1] : '';
  const monthMatch = text.match(/(\d+)\s*薪/);
  const numberText = text.replace(/\d+\s*薪/g, '');
  const matches = [...numberText.matchAll(SALARY_NUM_RE)];
  const unitSymbols = matches.map((match) => (match[2] || '').toLowerCase());
  const explicitUnits = unitSymbols.filter(Boolean);
  const inferredUnit = explicitUnits[0] || '';
  const numbers = matches
    .map((match, index) => {
      const unit = unitSymbols[index];
      if (unit) return salaryNumber(match[1], unit);
      // 「15-20K」「6-8千」这类范围只在末尾写单位，前面的小数字沿用同一单位；
      // 「5000-1万」前面的 5000 明显是元，保持原值。
      if (inferredUnit && Number(match[1]) < 1000) return salaryNumber(match[1], inferredUnit);
      return salaryNumber(match[1], '');
    })
    .filter((value) => value !== null && value > 0);
  if (!numbers.length) {
    return { raw, min: null, max: null, unit: null, negotiable: false, monthsPerYear: null, parsed: false };
  }
  let unit = null;
  if (period === '天' || period === '日') unit = '元/天';
  else if (period === '小时' || period === '时') unit = '元/小时';
  else if (period === '周') unit = '元/周';
  else if (period === '年') unit = '元/年';
  else if (period === '月') unit = '元/月';
  else if (/k|千|万/i.test(text)) unit = '元/月';
  else unit = '元/月';
  const min = Math.min(...numbers);
  const max = numbers.length > 1 ? Math.max(...numbers) : min;
  return {
    raw,
    min,
    max,
    unit,
    negotiable: false,
    monthsPerYear: monthMatch ? Number(monthMatch[1]) : null,
    parsed: true,
  };
}

const JOB_DETAIL_LINK_PATTERNS = [
  /\/job-\d{3}-\d{3}-\d{3}\.html/i,
  /\/student\/jobs\/[A-Za-z0-9_-]+\/detail\.html/i,
  /\/job[_-]?\d{3,}/i,
  /\/position\/\d+/i,
];
const AGGREGATE_LINK_PATTERNS = [
  /\/jobs?(?:\/)?(?:\?|$)/i,
  /\/joblist/i,
  /\/search/i,
  /\/list(?:\?|$|\/)/i,
  /\/campus(?:\?|$|\/)/i,
];

// 投递按钮只接受具体岗位页；搜索/列表/聚合页降级为「原页」。
export function linkKind(applyLink, sourceUrl = '') {
  const link = String(applyLink || '').trim();
  if (!link) return 'none';
  let path = link;
  try {
    path = new URL(link, 'https://internradar.local').pathname;
  } catch {
    return 'source_page';
  }
  if (JOB_DETAIL_LINK_PATTERNS.some((re) => re.test(path))) return 'job_detail';
  if (AGGREGATE_LINK_PATTERNS.some((re) => re.test(path))) return 'search';
  return sourceUrl ? 'source_page' : 'none';
}

export function classifyJob(input = {}) {
  const position = input.position || '';
  const major = input.majorRequirements ?? input.major_requirements ?? input.major ?? '';
  const company = input.company || '';
  const explicitType = input.positionType ?? input.position_type;
  const positionType = POSITION_TYPE_VALUES.includes(explicitType)
    ? explicitType
    : inferPositionType(`${position} ${major}`) || '校招';
  // 方向只按岗位标题判定：专业/标签常含“市场营销”等宽泛词，会把操作工、管培生误分类。
  // 源站明确给出方向字段时优先采用；否则只做关键词映射，推断不出就留空。
  const sourceDirection = input.sourceDirection ?? input.source_direction;
  let direction = DIRECTIONS.includes(sourceDirection)
    ? { value: sourceDirection, group: directionGroupOf(sourceDirection) }
    : classifyDirection(position);
  const industry = classifyIndustry(company, position, input.sourceIndustry ?? input.source_industry);
  return {
    position_type: positionType,
    is_intern: positionType === '实习' ? 1 : 0,
    direction: direction.value,
    direction_group: direction.group,
    industry: industry.value,
    industry_source: industry.source,
    cities: splitCities(input.location),
    link_kind: linkKind(input.applyLink ?? input.apply_link, input.sourceUrl ?? input.source_url),
  };
}


const COMPANY_NATURE_HINTS = {
  国企: ['国有', '国企', '电网', '石油', '铁路', '中建', '中铁', '中核', '中国'],
  事业单位: ['事业单位', '研究院', '研究所', '大学', '学院', '医院', '中心'],
  外企: ['外资', '外企', '有限公司（外国', 'microsoft', 'google', 'amazon', 'ibm', 'intel', '三星'],
  民企: ['民营', '有限公司', '股份有限公司', '科技', '网络'],
};

export function inferCompanyNature(...texts) {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return null;
  for (const [nature, keywords] of Object.entries(COMPANY_NATURE_HINTS)) {
    if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return nature;
  }
  return null;
}

// 源站日期可能是 ISO 字符串，也可能是 10/13 位时间戳。
export function parseSourceDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (/^\d{10,13}$/.test(text)) {
    const number = Number(text);
    const ms = number < 1e12 ? number * 1000 : number;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// 列表页没有岗位类型字段时按标题判断：实习优先，其次社招，默认校招。
export function inferPositionType(...texts) {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return null;
  if (/实习|intern|见习|暑期|寒假/.test(haystack)) return '实习';
  if (/社招|社会招聘/.test(haystack)) return '社招';
  if (/校招|校园招聘|应届|管培|\b20\d{2}\s*届|20\d{2}届/.test(haystack)) return '校招';
  return '校招';
}

// 企业实体化：统一全半角、去空白与括号、去掉公司法律形式/分支机构后缀，
// 让「XX有限公司」「XX（北京）有限公司」「XX股份有限公司北京分公司」聚到同一家企业。
export function companyKey(name) {
  let text = String(name || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[（(][^）)]*[）)]/g, '');
  text = text.replace(/(分公司|分行|分部|办事处|支公司)$/, '');
  text = text.replace(/(股份有限公司|有限责任公司|有限公司|集团有限公司|集团|公司)$/, '');
  return text.toLowerCase();
}

export function companyDisplayName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

// 岗位名归一：只去掉空白与标点，保留括号内的城市/方向信息，避免把不同岗位并成一条。
export function positionKey(title) {
  return String(primaryPositionTitle(title) || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

const POSITION_JOB_CODE_RE = /[（(]\s*[A-Za-z]{1,4}\d{4,}\s*[）)]/g;

// 列表页常见「岗位名|岗位名|…」的多岗位拼接；只取第一个岗位名做展示与去重键，
// 其余信息仍保留在原文中，避免把一条招聘拆成多条。
export function primaryPositionTitle(title) {
  const cleaned = String(title || '')
    .replace(POSITION_JOB_CODE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(/[|｜]/)[0].trim() || cleaned;
}

// 展示用标题：去掉招聘编号，多岗位拼接改为「首个岗位 等N个岗位」。
export function cleanPositionTitle(title) {
  const text = String(title || '').trim();
  if (!text) return '';
  const segments = text
    .replace(POSITION_JOB_CODE_RE, '')
    .split(/[|｜]/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (!segments.length) return text.replace(/\s+/g, ' ');
  if (segments.length === 1) return segments[0];
  return `${segments[0]} 等${segments.length}个岗位`;
}

// 跨源/跨城市去重键：同一公司的同名岗位只保留一条，城市合并展示。
export function jobDedupeKey(company, position) {
  const companyPart = companyKey(company);
  const positionPart = positionKey(position);
  if (!companyPart || !positionPart) return '';
  return `${companyPart}|${positionPart}`;
}

// 合并多个地点的展示文本，保持首次出现顺序并去重。
export function mergeLocations(...values) {
  const cities = [];
  for (const value of values) {
    for (const city of splitCities(value)) {
      if (city && !cities.includes(city)) cities.push(city);
    }
  }
  return cities.length ? cities.join(' / ') : null;
}

// 与前端 URL、缓存和跨端去重共用的稳定标识（SHA-256 前 16 字节）。
export async function stableId(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const VERSION_ID_RE = /^prod_fewshot_v(\d+)$/;

export function isVersionId(value) {
  return VERSION_ID_RE.test(String(value || ''));
}

export function nextVersionId(existingIds) {
  let max = 0;
  for (const id of existingIds) {
    const match = VERSION_ID_RE.exec(id || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `prod_fewshot_v${max + 1}`;
}

export function buildFewShotBlock(samples) {
  const lines = ['以下是参考示例，仅供学习输出格式和字段抽取方式：'];
  samples.forEach((sample, index) => {
    lines.push(`示例${index + 1}：`);
    lines.push(`原始文本片段：${String(sample.raw_text_excerpt || '').slice(0, 300)}`);
    lines.push(`正确输出：${JSON.stringify(sample.gold_label)}`);
  });
  lines.push('现在请解析以下网页纯文本内容：');
  return lines.join('\n');
}

export function buildProductionPrompt(version, content) {
  if (version.few_shot_samples?.length) {
    return `${version.base_prompt}\n\n${buildFewShotBlock(version.few_shot_samples)}\n${content}`;
  }
  return `${version.base_prompt}\n\n现在请解析以下网页纯文本内容：\n${content}`;
}

export function normalizeField(fieldName, value) {
  if (fieldName === 'is_intern') {
    if (typeof value === 'boolean') return value;
    return parseBoolLike(value);
  }
  if (typeof value === 'string') {
    const normalized = value.normalize('NFKC').trim();
    return normalized || null;
  }
  return value;
}

export function displayValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function lcsLength(a, b) {
  const rows = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const current = rows[j];
      rows[j] = a[i - 1] === b[j - 1] ? previous + 1 : Math.max(rows[j], rows[j - 1]);
      previous = current;
    }
  }
  return rows[b.length];
}

function similarityRatio(a, b) {
  if (!a && !b) return 1;
  const total = a.length + b.length;
  return total ? (2 * lcsLength(a, b)) / total : 0;
}

export function classifyError(fieldName, goldValue, predictedValue) {
  if (predictedValue === null || predictedValue === undefined) return '遗漏字段';
  if (fieldName === 'deadline' && typeof predictedValue === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(predictedValue)) return '格式错误';
  }
  if (typeof goldValue === 'string' && typeof predictedValue === 'string') {
    if (similarityRatio(goldValue, predictedValue) >= 0.6) return '拼写错误';
    if (['location', 'company', 'position'].includes(fieldName)) {
      return fieldName === 'location' ? '单位置偏差' : '抽取到无关信息';
    }
  }
  return '抽取到无关信息';
}

export const ERROR_FIELD_PRIORITY = [
  'company', 'position', 'deadline', 'location', 'position_type',
  'is_intern', 'major_requirements', 'apply_link', 'deadline_raw',
];

export function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function chunkText(text, size = 300) {
  return String(text || '').slice(0, size);
}

export function publicSiteDailyLimit() {
  const raw = Number(env('INTERNRADAR_PUBLIC_LLM_DAILY_LIMIT'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : PUBLIC_SITE_DAILY_CALL_LIMIT;
}

async function readTextLimited(response, limit = LLM_MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new LlmError('LLM 返回内容过大，请检查接口地址是否正确');
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// OpenAI 兼容调用；凭据只来自站点密钥，不进日志、数据库或响应。
async function requestLlm({
  apiBase, apiKey, model, temperature = 0, maxTokens = 2048, prompt,
}) {
  if (!apiBase || !apiKey) throw new LlmError('LLM API 未配置');
  const payload = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  };
  let body;
  try {
    const response = await fetch(`${String(apiBase).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await readTextLimited(response, 64 * 1024).catch(() => '');
      throw new LlmError(`LLM API 调用失败：HTTP ${response.status} ${text.slice(0, 200)}`);
    }
    body = JSON.parse(await readTextLimited(response));
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError(`LLM API 调用失败：${error?.message || error}`);
  }
  try {
    const content = body.choices[0].message.content;
    const usage = body.usage && typeof body.usage === 'object' ? body.usage : null;
    return { data: extractJson(content), usage };
  } catch (error) {
    throw new LlmError(`LLM 返回内容无法解析：${error?.message || error}`);
  }
}

export function siteLlmModel() {
  return env('INTERNRADAR_LLM_MODEL') || 'qwen-max';
}

export async function callLlm(options) {
  const status = siteLlmStatus();
  if (!status.ready) {
    throw new LlmError(`LLM API 未配置：${status.message}`);
  }
  return requestLlm({
    ...options,
    apiBase: env('INTERNRADAR_LLM_API_BASE'),
    apiKey: env('INTERNRADAR_LLM_API_KEY'),
  });
}

// 最小调用自检：只暴露可公开的错误摘要，不返回密钥或请求头。
export async function probeLlm(llm) {
  const model = siteLlmModel();
  const status = siteLlmStatus();
  if (!status.ready) return { ok: false, model, message: status.message };
  try {
    await llm({
      model,
      temperature: 0,
      maxTokens: 32,
      prompt: '只输出 JSON：{"ok":true}',
    });
    return { ok: true, model };
  } catch (error) {
    return { ok: false, model, message: String(error?.message || error).slice(0, 300) };
  }
}

function extractJson(content) {
  let text = String(content || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/`/g, '');
    if (text.startsWith('json')) text = text.slice(4);
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM 返回内容无法解析为 JSON');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM 返回的 JSON 不是对象');
  }
  return parsed;
}

const QUOTA_HINTS = ['429', 'quota', 'insufficient', 'rate limit', '配额', '余额', 'balance'];

export function isQuotaError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return QUOTA_HINTS.some((hint) => text.includes(hint));
}

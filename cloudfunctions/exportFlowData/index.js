// cloudfunctions/exportFlowData/index.js
// 流水批量导出：按时间范围查询流水，连表补齐车型、参考价格、操作人姓名
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const BATCH_SIZE = 1000; // 每批查询条数（单次 get/聚合上限）
const MAX_EXPORT = 2000; // 单次导出上限，防止数据过大导致云函数超时/超限

exports.main = async (event, context) => {
  const { startDate, endDate, type } = event;

  // 获取当前操作人身份，用于数据范围控制
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;

  if (!startDate) {
    return { success: false, msg: '请选择导出的开始日期' };
  }

  // 1. 时间范围：startDate 00:00 至 endDate 次日 00:00（endDate 缺省等于 startDate，即只导出当天）
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  end.setDate(end.getDate() + 1);

  const conditions = [
    { create_time: _.gte(start).and(_.lt(end)) }
  ];
  if (type && type !== 'all') {
    conditions.push({ type });
  }

  // 2. 数据范围控制（与流水页 getFlowList 保持一致）：
  //    管理员可导出所有数据；其他角色只能导出自己经手的流水
  const currentRole = await getUserRole(currentOpenId);
  if (currentRole !== 'admin') {
    conditions.push({ _openid: currentOpenId });
  }
  const queryCondition = _.and(conditions);

  try {
    // 3. 先统计总数
    const countRes = await db.collection('transaction_logs')
      .where(queryCondition)
      .count();
    const total = countRes.total;
    if (total === 0) {
      return { success: true, data: [], total: 0, exported: 0 };
    }

    // 4. 分批拉取（聚合 + 连表），直到取完或达到导出上限
    const fetchLimit = Math.min(total, MAX_EXPORT);
    let rows = [];

    for (let fetched = 0; fetched < fetchLimit; fetched += BATCH_SIZE) {
      const batch = await db.collection('transaction_logs')
        .aggregate()
        .match(queryCondition)          // A. 筛选
        .sort({ create_time: 1 })       // B. 按时间正序，导出文件从早到晚
        .skip(fetched)
        .limit(BATCH_SIZE)
        // C. 规范化 oe_no（兼容数组格式），用于连表匹配产品
        .addFields({
          oe_key: $.cond({
            if: $.isArray('$oe_no'),
            then: $.arrayElemAt(['$oe_no', 0]),
            else: '$oe_no'
          })
        })
        // D. 连员工表取操作人姓名
        .lookup({
          from: 'employees',
          localField: '_openid',
          foreignField: '_openid',
          as: 'empInfo'
        })
        // E. 连产品表：优先用 product_id 精确匹配
        .lookup({
          from: 'products',
          localField: 'product_id',
          foreignField: '_id',
          as: 'productById'
        })
        // F. 再用 OE 码兜底匹配（建档产生的流水没有 product_id）
        .lookup({
          from: 'products',
          localField: 'oe_key',
          foreignField: 'oe_no',
          as: 'productByOe'
        })
        // G. 数据清洗：操作人姓名、产品信息、时间格式化
        .addFields({
          operator_name: $.cond({
            if: $.gt([$.size('$empInfo'), 0]),
            then: $.arrayElemAt(['$empInfo.name', 0]),
            else: '未知人员'
          }),
          product_info: $.cond({
            if: $.gt([$.size('$productById'), 0]),
            then: $.arrayElemAt(['$productById', 0]),
            else: $.cond({
              if: $.gt([$.size('$productByOe'), 0]),
              then: $.arrayElemAt(['$productByOe', 0]),
              else: null
            })
          }),
          formatted_time: $.dateToString({
            date: '$create_time',
            format: '%Y-%m-%d %H:%M:%S',
            timezone: 'Asia/Shanghai'
          })
        })
        // H. 投影：只保留导出需要的字段
        .project({
          oe_no: 1,
          oe_key: 1,
          quantity: 1,
          type: 1,
          operator_name: 1,
          formatted_time: 1,
          car_model: '$product_info.car_model',
          price: '$product_info.price'
        })
        .end();

      rows = rows.concat(batch.list);
    }

    return { success: true, data: rows, total, exported: rows.length };

  } catch (err) {
    console.error('导出流水失败:', err);
    return { success: false, msg: err.message };
  }
};

// 根据 openid 查员工角色（数据范围控制用）
async function getUserRole(openid) {
  if (!openid) return null;
  const res = await db.collection('employees')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length === 0) return null;
  return res.data[0].role || 'guest';
}

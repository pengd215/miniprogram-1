// cloudfunctions/getFlowList/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();
const _ = db.command;
// 【关键】引入聚合操作符，用于在数据库内部处理数据
const $ = db.command.aggregate; 

exports.main = async (event, context) => {
  const { oe_no, dateStr, type, page = 1, pageSize = 20 } = event;
  
  // 1. 构建筛选条件模糊搜索 oe，备注
  let queryCondition = {};
  if (oe_no) {
    queryCondition = _.or([
      { oe_no: new RegExp(oe_no, 'i') },
      { remark: new RegExp(oe_no, 'i') } 
    ]); 
  }
  if (type && type !== 'all') {
    queryCondition.type = type;
  }
  // 日期筛选逻辑
  if (dateStr) {
    const startDate = new Date(dateStr); 
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1); 
    queryCondition.create_time = _.gte(startDate).and(_.lt(endDate));
  }

  try {
    // --- 第一步：获取总数  ---
    const countRes = await db.collection('transaction_logs')
      .where(queryCondition)
      .count();

    // --- 第二步：使用聚合管道查询 ---
    const res = await db.collection('transaction_logs')
      .aggregate()
      .match(queryCondition) // A. 筛选数据
      .sort({ create_time: -1 }) // B. 按时间倒序
      .skip((page - 1) * pageSize)     // C. 分页处理
      .limit(pageSize) 
      // D. 连表查询：去 employees 表找名字
      .lookup({
        from: 'employees',            // 关联的集合名 
        localField: '_openid',       // 当前流水表的字段 
        foreignField: '_openid',       // 员工表的字段 
        as: 'empInfo'         // 关联后的结果存放在这个临时字段里
      })
      // E. 【关键】数据清洗：提取名字 & 格式化时间
      .addFields({
        _openid_name: $.cond({
          if: $.gt([$.size('$empInfo'), 0]),
          then: $.arrayElemAt(['$empInfo.name', 0]),
          else: '已离职/非员工'
        }),
        // 2. 格式化时间：转为 "YYYY-MM-DD HH:mm:ss" 并修正时区为上海
        formatted_time: $.dateToString({
          date: '$create_time',
          format: '%Y-%m-%d %H:%M:%S',
          timezone: 'Asia/Shanghai' 
        })
      })
      //投影：隐藏不需要的原始数据
      .project({
        empInfo: 0, // 隐藏刚才连表查出来的原始数组
        create_time: 0,     // 隐藏原始的 Date 对象 (前端直接用 formatted_time)
        _openid: 0          // 隐藏用户的 _openid
      })
      // G. 结束管道
      .end();
    return {
      success: true,
      data: res.list,      // 注意：聚合查询返回的数据在 list 字段里
      total: countRes.total
    };

  } catch (err) {
    console.error('查询流水失败:',err);
    return { success: false, msg: err.message };
  }
};
// cloudfunctions/cleanEditSnapshots/index.js
// 一次性清理云函数：删除"产品编辑"操作产生的快照及关联编辑流水
// 背景：编辑页修改不记录流水、不支持回退，此前误接入回退功能产生的数据需要清除
// 用法：部署后在微信开发者工具中右键该云函数 → 云端测试，传入 { "dryRun": true } 先预览，确认无误后传 { "dryRun": false } 执行删除
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const dryRun = event.dryRun !== false; // 默认预览模式，避免误删

  // ====== 1. 删除所有"编辑产品"类型的快照 ======
  let deletedSnapshots = 0;
  let deletedLogs = 0;
  const detail = [];

  // 循环分页删除（where 查询不受单次 20 条限制，但 remove 建议分批）
  for (let i = 0; i < 50; i++) {
    const res = await db.collection('operation_snapshots')
      .where({ operation_type: 'product_update' })
      .limit(100)
      .get();
    if (!res.data || res.data.length === 0) break;

    for (const snap of res.data) {
      detail.push({
        snapshotId: snap._id,
        targetDocId: snap.target_doc_id,
        operator: snap.operator_name || snap.operator_openid,
        createTime: snap.create_time
      });
      if (!dryRun) {
        await db.collection('operation_snapshots').doc(snap._id).remove();
      }
      deletedSnapshots++;
    }
    if (dryRun) break; // 预览模式只统计第一页，足够确认数量级
  }

  // ====== 2. 删除编辑页产生的流水记录（type = product_update）======
  for (let i = 0; i < 50; i++) {
    const res = await db.collection('transaction_logs')
      .where({ type: 'product_update' })
      .limit(100)
      .get();
    if (!res.data || res.data.length === 0) break;

    for (const log of res.data) {
      if (!dryRun) {
        await db.collection('transaction_logs').doc(log._id).remove();
      }
      deletedLogs++;
    }
    if (dryRun) break;
  }

  // ====== 3. 清除产品文档上残留的快照关联字段 ======
  const productRes = await db.collection('products')
    .where({ last_snapshot_id: _.exists(true) })
    .limit(100)
    .get();
  let cleanedProducts = 0;
  for (const p of (productRes.data || [])) {
    if (!dryRun) {
      await db.collection('products').doc(p._id).update({
        data: { last_snapshot_id: _.remove() }
      });
    }
    cleanedProducts++;
  }

  return {
    success: true,
    mode: dryRun ? '预览(未实际删除)' : '已执行删除',
    deletedSnapshots,
    deletedLogs,
    cleanedProducts,
    detail: detail.slice(0, 20),
    hint: dryRun ? '确认数量后，请用 { "dryRun": false } 再次调用执行实际删除' : '清理完成，本云函数已无用，可从云端删除'
  };
};

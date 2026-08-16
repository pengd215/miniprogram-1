// cloudfunctions/warehouseManage/index.js
// 仓库管理配置层：库区/库位/绑定商品
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 允许操作仓库配置的角色
const ALLOWED_ROLES = ['admin', 'warehouse_manager'];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;
  const { action } = event;

  if (!currentOpenId) {
    return { success: false, code: 401, message: '未获取到用户身份' };
  }

  // 校验角色
  const role = await getUserRole(currentOpenId);
  if (!role) {
    return { success: false, code: 403, message: '未找到员工信息，无权操作' };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { success: false, code: 403, message: '当前角色无权操作仓库配置' };
  }

  try {
    switch (action) {
      case 'listWarehouses': return await listWarehouses();
      case 'addWarehouse': return await addWarehouse(event);
      case 'deleteWarehouse': return await deleteWarehouse(event);
      case 'listLocations': return await listLocations(event);
      case 'generateLocations': return await generateLocations(event);
      case 'bindProduct': return await bindProduct(event);
      case 'unbindProduct': return await unbindProduct(event);
      default: return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('warehouseManage 出错:', err);
    return { success: false, message: '服务器内部错误: ' + err.message };
  }
};

// 根据 openid 查员工角色
async function getUserRole(openid) {
  const res = await db.collection('employees')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length === 0) return null;
  return res.data[0].role || 'guest';
}

// 列出所有库区
async function listWarehouses() {
  const res = await db.collection('warehouses')
    .orderBy('create_time', 'asc')
    .get();
  return { success: true, data: res.data };
}

// 新增库区
async function addWarehouse(event) {
  const { name, code, desc } = event;
  if (!name || !code) {
    return { success: false, message: '库区名称和编码不能为空' };
  }
  // 编码唯一性校验
  const exist = await db.collection('warehouses')
    .where({ code })
    .count();
  if (exist.total > 0) {
    return { success: false, message: '库区编码已存在' };
  }
  await db.collection('warehouses').add({
    data: {
      name, code, desc: desc || '',
      create_time: db.serverDate()
    }
  });
  return { success: true, message: '库区添加成功' };
}

// 删除库区（同时删除其下所有库位）
async function deleteWarehouse(event) {
  const { id } = event;
  if (!id) return { success: false, message: '缺少库区ID' };
  /*** 先删除该库区下所有库位 ***/
  const locRes = await db.collection('locations')
    .where({ warehouse_id: id })
    .get();
  if (locRes.data.length > 0) {
    const ids = locRes.data.map(i => i._id);
    // 分批删除（每批 100 条）
    for (let i = 0; i < ids.length; i += 100) {
      await db.collection('locations')
        .where({ _id: _.in(ids.slice(i, i + 100)) })
        .remove();
    }
  }
  await db.collection('warehouses').doc(id).remove();
  return { success: true, message: '库区已删除' };
}

// 列出某库区下的库位（支持按状态筛选）
async function listLocations(event) {
  const { warehouseId } = event;
  if (!warehouseId) return { success: false, message: '缺少库区ID' };
  const res = await db.collection('locations')
    .where({ warehouse_id: warehouseId })
    .orderBy('location_code', 'asc')
    .limit(1000)
    .get();
  return { success: true, data: res.data };
}

// 批量生成库位
async function generateLocations(event) {
  const { warehouseId, prefix, startRow, endRow, startCol, endCol } = event;
  if (!warehouseId || !prefix) return { success: false, message: '缺少参数' };
  const sR = parseInt(startRow), eR = parseInt(endRow);
  const sC = parseInt(startCol), eC = parseInt(endCol);
  if (isNaN(sR) || isNaN(eR) || isNaN(sC) || isNaN(eC) || sR > eR || sC > eC) {
    return { success: false, message: '行列范围无效' };
  }
  if ((eR - sR + 1) * (eC - sC + 1) > 500) {
    return { success: false, message: '一次最多生成 500 个库位' };
  }
  // 先查旧库位（待新库位写入成功后再删，避免中途失败导致数据丢失）
  const oldRes = await db.collection('locations')
    .where({ warehouse_id: warehouseId })
    .get();
  const oldIds = oldRes.data.map(i => i._id);

  // 生成库位（分批串行写入，避免单次并发过多触发限流）
  const docs = [];
  for (let r = sR; r <= eR; r++) {
    for (let c = sC; c <= eC; c++) {
      const row = String(r).padStart(2, '0');
      const col = String(c).padStart(2, '0');
      const code = prefix + '-' + row + '-' + col;
      docs.push({
        warehouse_id: warehouseId,
        prefix,
        row: r,
        col: c,
        location_code: code,
        product_id: null,   // 未绑定商品
        status: 'empty',    // empty=空位 bound=已绑定
        create_time: db.serverDate()
      });
    }
  }
  const BATCH = 50;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await db.collection('locations').add({ data: batch });
  }

  // 新库位写入成功后，再删除旧库位（先建后删，防数据丢失）
  if (oldIds.length > 0) {
    for (let i = 0; i < oldIds.length; i += 100) {
      await db.collection('locations')
        .where({ _id: _.in(oldIds.slice(i, i + 100)) })
        .remove();
    }
  }
  return { success: true, message: '已生成 ' + docs.length + ' 个库位' };
}

// 扫码绑定商品到库位
async function bindProduct(event) {
  const { locationId, barcode } = event;
  if (!locationId || !barcode) return { success: false, message: '缺少库位或条码' };

  // 1. 查库位
  const locRes = await db.collection('locations').doc(locationId).get();
  const location = locRes.data;
  if (!location) return { success: false, message: '库位不存在' };

  // 2. 按商品 _id 一物一码精确匹配（扫码扫的是商品档案的 _id）
  const pRes = await db.collection('products').where({
    _id: barcode
  }).get();
  if (pRes.data.length === 0) {
    return { success: false, code: 404, message: '未找到该 _id 对应的商品，请确认扫码内容为商品档案ID' };
  }

  const product = pRes.data[0];

  // 3. 更新商品 location 为当前库位号
  await db.collection('products').doc(product._id).update({
    data: { location: location.location_code }
  });

  // 4. 更新库位绑定状态
  await db.collection('locations').doc(locationId).update({
    data: {
      product_id: product._id,
      status: 'bound'
    }
  });

  return { success: true, message: `已绑定: ${product.oe_no}` };
}

// 解绑库位
async function unbindProduct(event) {
  const { locationId } = event;
  if (!locationId) return { success: false, message: '缺少库位ID' };
  const locRes = await db.collection('locations').doc(locationId).get();
  const location = locRes.data;
  if (!location) return { success: false, message: '库位不存在' };
  // 清除商品 location
  if (location.product_id) {
    await db.collection('products').doc(location.product_id).update({
      data: { location: '' }
    });
  }
  await db.collection('locations').doc(locationId).update({
    data: { product_id: null, status: 'empty' }
  });
  return { success: true, message: '已解绑' };
}
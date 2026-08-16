// cloudfunctions/userLogin/index.js
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) 
const db = cloud.database()

exports.main = async (event, context) => {
  // 获取当前用户的 OpenID (微信自动注入)
  const wxContext = cloud.getWXContext()
  const currentOpenId = wxContext.OPENID// 获取当前登录微信的 OpenID

  try {
    const { username, password } = event

    // 1. 去数据库查询员工表
    const res = await db.collection('employees')
    .where({
      username: username,
      password: password 
    }).get()

    // 2. 判断是否查到数据
    if (res.data.length > 0) {
      // ！！res 是数据库查询结果对象，用户数据在 res.data[0]
      const userData = res.data[0]//提取用户数据对象
      // 登录成功
      // 2. 检查该账号是否已经绑定了 OpenID
      if (userData._openid) {
        // 已绑定：对比当前微信的 OpenID 是否和数据库里存的一致
        if (userData._openid !== currentOpenId) {
          return {
            success: false,
            msg: '该账号已绑定其他微信，请联系管理员注册账户！'
          }
        }
      } else {
        // 未绑定（首次登录）：将当前微信的 OpenID 写入数据库，完成绑定
        await db.collection('employees').doc(userData._id).update({
          data: {
            _openid: currentOpenId
          }
        })
      }
      return {
        success: true,
        msg: '登录成功',
        data: { // 返回查到的用户信息
        _id: userData._id, 
        role: userData.role|| 'guest',
        name: userData.name|| '未知用户',  
        username: userData.username, 
        _openid: wxContext.OPENID // 把 OpenID 也一起返回给前端，方便前端存入 globalData
      }
    }
    } else {
      // 登录失败
      return {
        success: false,
        msg: '账号或密码错误'
      }
    }
  } catch (err) {
    console.error('数据库查询出错:', err)
    return {
      success: false,
      msg: '服务器内部错误: ' + err.message
    }
  }
}
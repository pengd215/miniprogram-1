// cloudfunctions/userLogin/index.js
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) 
const db = cloud.database()

exports.main = async (event, context) => {
  // 获取当前用户的 OpenID (微信自动注入)
  const wxContext = cloud.getWXContext()

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
      return {
        success: true,
        msg: '登录成功',
        data: userData, // 返回查到的用户信息
        _id: userData._id, 
        role: userData.role|| 'guest',
        name: userData.name|| '未知用户',  
        username: userData.username, 
        openid: wxContext.OPENID // 【重要】把 OpenID 也一起返回给前端，方便前端存入 globalData
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
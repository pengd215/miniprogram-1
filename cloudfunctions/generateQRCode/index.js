const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const QRCode = require('qrcode')

exports.main = async (event, context) => {
  const { text, size = 200 } = event
  const safeSize = Math.min(Math.max(parseInt(size, 10) || 200, 50), 1000); // 限制尺寸防资源滥用


  if (!text) {
    return { success: false, error: '缺少text参数' }
  }

  try {
    // 生成二维码 base64 图片
    const qrCodeDataURL = await QRCode.toDataURL(text, {
      width: safeSize,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })

    // 去掉 data:image/png;base64, 前缀
    const base64 = qrCodeDataURL.replace(/^data:image\/png;base64,/, '')

    return {
      success: true,
      base64: base64
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}

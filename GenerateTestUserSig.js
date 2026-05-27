const CryptoJS = require('crypto-js');

class LibGenerateTestUserSig {
  constructor(sdkAppId, secretKey, expire = 604800) {
    this.sdkAppId = sdkAppId;
    this.secretKey = secretKey;
    this.expire = expire;
  }

  // Base64url encoding helper
  base64url(str) {
    const base64 = CryptoJS.enc.Base64.stringify(str);
    return base64
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  genTestUserSig(userId) {
    const currTime = Math.floor(Date.now() / 1000);
    const sigDoc = {
      'TLS.ver': '2.0',
      'TLS.identifier': userId,
      'TLS.sdkappid': Number(this.sdkAppId),
      'TLS.expire': Number(this.expire),
      'TLS.time': Number(currTime)
    };

    // Encode JSON document
    const jsonStr = JSON.stringify(sigDoc);
    const base64Str = this.base64url(CryptoJS.enc.Utf8.parse(jsonStr));

    // Sign using HMAC-SHA256
    const signature = CryptoJS.HmacSHA256(base64Str, this.secretKey);
    const signatureBase64 = this.base64url(signature);

    // Build the final UserSig JSON document
    const sigVal = {
      'TLS.sig': signatureBase64,
      'TLS.sdkappid': Number(this.sdkAppId),
      'TLS.identifier': userId,
      'TLS.expire': Number(this.expire),
      'TLS.time': Number(currTime)
    };

    const finalJsonStr = JSON.stringify(sigVal);
    const finalBase64Str = Buffer.from(finalJsonStr).toString('base64');
    // Replace standard base64 characters for base64url compatibility
    return finalBase64Str
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}

module.exports = LibGenerateTestUserSig;

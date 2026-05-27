const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Api: TLSSigAPIv2 } = require('tls-sig-api-v2');

const root = path.join(__dirname, '..');
const secretPath = path.join(root, 'secret.json');
const builtinPath = path.join(root, 'im-config-builtin.js');

// 检查 secret.json 是否存在
if (!fs.existsSync(secretPath)) {
  console.error('未找到 secret.json！');
  console.error('请先在项目根目录创建 secret.json 并填入真实的腾讯云 IM 凭证。');
  console.error('参考格式：');
  console.error(JSON.stringify({
    SDKAppID: 1400000000,
    SecretKey: '你的密钥',
    selfID: 'UserA',
    partnerID: 'UserB',
    partnerCharacter: 'char_girl'
  }, null, 2));
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(secretPath, 'utf-8'));

// 验证必填字段
const required = ['SDKAppID', 'SecretKey', 'selfID', 'partnerID', 'partnerCharacter'];
for (const key of required) {
  if (!secret[key]) {
    console.error(`secret.json 缺少必填字段 "${key}"`);
    process.exit(1);
  }
}

// 检查是否为占位值
if (secret.SDKAppID === 1400000000 || secret.SecretKey.includes('YOUR_')) {
  console.error('secret.json 中还是占位值，请先填入真实的 SDKAppID 和 SecretKey。');
  process.exit(1);
}

const expire = 15552000; // 180天

// 构建对方的配置：交换 selfID/partnerID，翻转角色形象
const partnerCharacter = secret.partnerCharacter === 'char_girl' ? 'char_boy' : 'char_girl';

console.log('========================================');
console.log('  LovePet - 打包分发');
console.log('========================================');
console.log(`  你的身份:   ${secret.selfID}`);
console.log(`  对方的身份: ${secret.partnerID}`);
console.log(`  对方形象:   ${partnerCharacter}`);
console.log('========================================');

// 为对方的身份生成 UserSig（SecretKey 仅在此脚本中使用，绝不进入 EXE）
const gen = new TLSSigAPIv2(secret.SDKAppID, secret.SecretKey);
const userSig = gen.genUserSig(secret.partnerID, expire);

// 写入内置模块（不含 SecretKey）
const builtin = {
  SDKAppID: secret.SDKAppID,
  selfID: secret.partnerID,       // 对方身份
  partnerID: secret.selfID,       // 你的身份
  partnerCharacter: partnerCharacter,
  userSig: userSig
};

fs.writeFileSync(
  builtinPath,
  `// 构建时自动生成。UserSig ${Math.round(expire / 86400)} 天后过期。\nmodule.exports = ${JSON.stringify(builtin, null, 2)};\n`
);

console.log(`UserSig 已为 ${secret.partnerID} 生成，${Math.round(expire / 86400)} 天后过期。`);
console.log('开始打包...');

// 执行打包
try {
  execSync('npx electron-builder build --win', { cwd: root, stdio: 'inherit' });
  console.log('');
  console.log('打包完成！EXE 在 dist/ 目录下。');
  console.log('把 EXE 发给对方，她双击即可运行，无需任何配置。');
} finally {
  fs.unlinkSync(builtinPath);
}

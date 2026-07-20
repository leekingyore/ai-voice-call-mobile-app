# AI 语音通话应用

这是一个可以本地运行，也可以部署后在手机浏览器直接使用的 AI 语音通话 Web 应用。用户在页面中填写 API Key，应用会通过后端接口换取一次性临时密钥，然后用浏览器 WebRTC 与实时语音模型建立连接。

## 手机上怎么用

手机不能直接运行 `server.js`，也不能直接双击 `index.html`。手机要直接使用，需要先把整个项目部署到公网 HTTPS 地址。

推荐用 Vercel：

1. 打开 `https://vercel.com`。
2. 登录账号。
3. 新建项目。
4. 上传或导入这个项目文件夹。
5. 部署完成后，Vercel 会给你一个网址，类似：

```text
https://你的项目名.vercel.app
```

6. 用手机浏览器打开这个网址。
7. 填写 API Key。
8. 点击“开始通话”。
9. 手机提示麦克风权限时，选择允许。

部署时要上传整个项目，不是只上传一个 HTML 文件。需要包含这些文件：

```text
package.json
vercel.json
server.js
api/realtime/session.js
public/index.html
public/styles.css
public/app.js
public/manifest.webmanifest
public/icon.svg
```

部署后，也可以在手机浏览器里把网页添加到桌面：

- iPhone Safari：点击分享按钮，然后选择“添加到主屏幕”。
- Android Chrome：点击右上角菜单，然后选择“添加到主屏幕”或“安装应用”。

## 运行方式

1. 确保电脑已安装 Node.js 18 或更高版本。
2. 在当前文件夹运行：

```bash
npm start
```

3. 打开终端里显示的地址，通常是：

```text
http://localhost:3000
```

4. 在页面中填写 API Key，选择模型和语音，点击“开始通话”。
5. 浏览器询问麦克风权限时选择允许。

## 默认配置

- 默认模型：`gpt-realtime`
- 默认语音：`alloy`
- 默认语言：中文
- 语音检测：服务端 VAD，会自动判断你何时开始和结束说话

## 安全说明

本应用适合本地测试和原型验证。正式上线时，不建议让普通用户直接填写主账户 API Key。更稳妥的做法是：

- 用户登录你的业务系统。
- 后端根据用户权限创建一次性临时密钥。
- 前端只拿临时密钥建立实时通话。
- 后端记录用量、限制频率，并保护主账户 API Key。

## 文件结构

```text
.
├── package.json
├── server.js
├── README.md
└── public
    ├── index.html
    ├── styles.css
    └── app.js
```

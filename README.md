# 多平台通知 · 课简扩展组件

把 [课简](https://github.com/cursimple/cursimple-app) 里的**上课提醒、笔记待办到期、组件的新内容和截止提醒**，同时推送到你常用的平台：

- **多平台、多目标**：个人微信、QQ、飞书、企业微信、钉钉、QQ／网易邮箱，以及 Server酱、PushPlus、WxPusher、PushDeer、Bark 等；同一个平台可以绑定多个群或帐号
- **每个目标单独设置**：独立开关、独立选择推送哪些通知、是否带正文
- **结果如实显示**：只有平台明确确认才显示“已发送”；只返回“已接收”或“排队中”的另有标记，需要核对的不会被当成成功；一个平台失败不影响其他平台，重试时跳过已确认成功的目标
- **绑定在组件里完成**：微信扫码、QQ 获取收件人、测试消息和发送记录都在组件页面；凭据加密保存在手机里

组件和课简本体是解耦的：平台协议、登录、收件人和消息格式都在本组件，课简只提供通用的通知出口、受限网络调用、加密存储和 TLS 邮件传输。QQ 和个人微信默认直接连接平台，无需安装或部署 OpenClaw。

> **验证状态**：协议、回执判断和界面都有自动化测试，各推送平台的接口也用无效密钥确认过会明确拒绝；但**没有用真实账号做过端到端投递验收**。第一次绑定后请先点「发送测试」，到对应平台核对是否真的收到。

| 平台 | 直接接入方式 | 用户需要完成 |
|---|---|---|
| 个人微信 | 腾讯微信机器人 iLink 接口 | 组件内扫码、填写手机显示的配对数字（如有）、向连接的机器人发消息绑定私信会话 |
| QQ | QQ 官方机器人 API | 创建并启用机器人，填写 AppID/AppSecret，获取对应用户或群的 OpenID |
| QQ 邮箱 | SMTP over TLS，服务器 `smtp.qq.com:465` | 开启 SMTP，填写发件邮箱、SMTP 授权码与收件邮箱 |
| 飞书 | 自定义群机器人 Webhook | 创建群机器人、填写 Webhook；安全设置要求时填签名密钥和关键词 |
| 企业微信 | 群消息推送 Webhook | 创建群消息推送、填写 Webhook |
| 钉钉 | 自定义群机器人 Webhook | 填写 Webhook；按机器人安全设置填写加签密钥或关键词 |
| 网易 163／126 邮箱 | SMTP over TLS，`smtp.163.com` / `smtp.126.com` | 开启 SMTP，填写发件邮箱、客户端授权码与收件邮箱 |
| Server酱 | 官方 SendKey 推送接口（SCT / sctp） | 获取 SendKey，并在平台配置接收通道 |
| PushPlus 推送加 | 官方发送接口，可选查询发送状态 | 填写 Token；需要确认最终送达时再配置查询权限 |
| WxPusher | 应用 AppToken 推送接口 | 创建应用，接收者订阅后填写 UID |
| PushDeer | 官方或自建 HTTPS 服务 | 在接收客户端取得 PushKey |
| Bark | 官方或自建 HTTPS 服务（iOS 接收端） | 取得设备 Key |
| 其他平台 | 自建 Webhook 或已有 OpenClaw 桥接 | 配置接收统一通知 JSON 的服务，或既有桥接路由 |

推送类渠道的“成功”含义不同：只返回接收或排队的，记录显示“平台已接收”或“等待平台结果”；平台给出明确的发送结果后才显示“已发送”。请到接收端核对实际消息。

## 安装和使用

需要支持扩展组件**接口版本 8** 的课简。该接口目前在开发版中，随下一个正式版发布；在那之前，已发布的课简会提示“接口版本太新”而拒绝安装本组件。

1. 在 [Releases](https://github.com/cursimple/cursimple-notify-component/releases) 下载 `multi-platform-notify-vX.Y.Z.zip`，再在课简 → 侧边栏「插件」→「组件」标签页 →「导入 ZIP」选中它。
2. 打开组件，点「添加通知目标」，选择平台，完成下面对应的绑定。
3. 保存绑定，再点「发送测试」。成功回执代表平台接受了请求；请到目标平台核对实际消息。
4. 每个目标可独立开关，选择上课提醒、笔记待办到期、组件新内容和组件截止提醒。同一平台可以添加多个目标。

新增目标只接收绑定后的新通知，不重放历史。已完成、已读或已忽略的来源停止排队。笔记待办在截止前 24 小时内提醒一次，上课提醒跟随课简的通知设置。手机必须联网并允许课简后台运行。

## 个人微信

选择「个人微信」和「直接连接平台」，点「扫码连接微信」。二维码在手机本地生成，未发送给第三方制图服务。用微信扫码确认；同一部手机可以先截图，再从微信扫一扫相册选择。若微信要求配对数字，在组件里填写手机上显示的数字。

确认后，向微信中刚连接的机器人发一条消息。组件只采纳扫码者对应的私信会话，不绑定其他用户或群消息。显示「微信会话已绑定」后保存目标，再发送测试。

登录、二维码过期、配对数字、IDC 跳转、读取会话和文本发送参照腾讯维护的 `@tencent-weixin/openclaw-weixin` 2.4.9 发布源码实现，使用其 iLink 协议；本组件不调用 OpenClaw CLI。支持私信，不支持向任意联系人或微信群群发。登录过期或平台拒绝会在记录中显示，需要重新扫码或向已连接的机器人发消息恢复会话。

## QQ

在 [QQ 开放平台](https://bot.q.qq.com/) 创建并启用官方机器人，准备 AppID 和 AppSecret，并开通需要的私聊／群事件与主动消息权限。普通 QQ 账号密码、QQ 号或群号不能直接代替机器人凭据和 OpenID。

选择 QQ 机器人，填入凭据和接收位置。点「获取收件人」，按页面提示私聊机器人，或在目标群 @ 机器人并发送临时随机绑定口令。组件通过官方 Gateway 事件获取该机器人对应的 OpenID；也可以手动填写官方消息事件里的 OpenID。获取用的连接完成或取消后会关闭，不在后台长驻。

保存后通过 `bots.qq.com/app/getAppAccessToken` 获取授权，使用 `api.sgroup.qq.com/v2/users/{OPENID}/messages` 或 `v2/groups/{OPENID}/messages` 直接发送，消息 ID 有效才确认成功。令牌会加密缓存，到期或遇到明确鉴权拒绝时刷新。OpenID 与具体机器人绑定，其他机器人的 OpenID 不能混用。

QQ 的主动发送可能受平台权限、配额和近期互动条件限制。组件会保留拒绝代码供核对，不会把被拒绝的消息显示为成功。接口与目标格式参考官方 QQ Bot API 及 `@openclaw/qqbot` 2026.7.1 发布源码。

## QQ 邮箱

在 QQ 邮箱的设置中开启 POP3/SMTP 或 IMAP/SMTP 服务，完成邮箱要求的安全验证后生成授权码。组件选择「QQ 邮箱」，填入发件 QQ 邮箱、SMTP 授权码与收件邮箱。收件邮箱可以与发件邮箱相同，也可以是其他邮箱。Foxmail 和 `vip.qq.com` 别名也可作为发件帐号，仍需对应 QQ 邮箱的有效 SMTP 授权码。

使用 `smtp.qq.com` 的 TLS 465 端口，校验服务器证书与域名，通过 SMTP 认证发送 UTF-8 纯文本邮件。主题支持中文和表情，正文用 MIME Base64 编码。授权码不使用 QQ 登录密码，保存在手机的加密配置中。

保存后点击发送测试，再检查收件箱或垃圾邮件。SMTP 最终返回 250 接收确认才记录成功；认证失败、收件人拒绝等会保留服务器代码。邮件正文提交后断线会标成需核对，先查邮箱再重试。SMTP 接受不代表收件人已阅读，也无法保证其他邮箱不把通知归入垃圾邮件。

## 国内常用推送服务

| 服务 | 怎么接 | 注意 |
|---|---|---|
| Server酱 | 填 SendKey，支持 `SCT…` 和 `sctp…` 两种；先在平台配置接收通道 | 只确认“接收”，到接收通道核对 |
| PushPlus | 填推送 Token；群组需先订阅；可选填查询密钥 | 配置查询权限后会继续核对最终发送状态；没有查询权限时显示“平台已接收” |
| WxPusher | 填应用 AppToken 和已订阅该应用的用户 UID | 逐个接收者校验任务回执 |
| PushDeer | 填接收设备的 PushKey，可用官方服务或自建 HTTPS 服务 | 消息内容放在 `text` 字段（文本类型下 `desp` 不显示） |
| Bark | 填 iPhone／iPad 的设备 Key，可用官方服务或自建 HTTPS 服务 | 自建服务必须是 HTTPS |
| 网易 163／126 邮箱 | 开启 SMTP，填客户端授权码 | 偶尔会被判为垃圾邮件（554），失败如实显示 |

## 回执与隐私

Webhook、SMTP 授权码、AppSecret、微信令牌、会话上下文和翻页游标使用 Android Keystore 加密，排除普通快照、日志和备份。目标卡片只显示域名，不展示凭据。

每个目标分别确认。失败目标不影响其他平台，已确认成功的目标重试时跳过。发送超时、响应无法确认或保存回执失败会标成「需核对」，停止自动重发；用户先检查目标平台再手动重试。微信重试使用同一事件和目标生成的稳定 `client_id`。

## 可选：已有 OpenClaw 桥接

已部署 OpenClaw 的用户仍可在 QQ／微信的「接入方式」中选择桥接。其他 OpenClaw 渠道使用相同路径。

- 微信渠道：`@tencent-weixin/openclaw-weixin`，渠道 ID `openclaw-weixin`。
- QQ 渠道：`@openclaw/qqbot`，渠道 ID `qqbot`。
- 桥接配置：复制 `bridge/config.example.json` 为 `bridge/config.json`，填入真实渠道、账户 ID 和固定收件人，设置至少 24 字符的 `CURSIMPLE_NOTIFY_BRIDGE_TOKEN`，再执行 `node bridge/server.mjs bridge/config.json`。
- 默认服务只监听 `127.0.0.1:8787`，手机需填写自己的 HTTPS 反向代理完整地址 `/v1/notify`。

桥接以固定路由和通知 ID 去重，不执行手机提交的命令。CLI 只有返回对应渠道、非 dry-run 的 send 结果及有效消息 ID 才确认成功，空 JSON 或取消结果不算成功。

## 开发与验证

需要 Node.js 20 或更高版本，不需要安装依赖。

```sh
npm test          # 协议、回执与桥接的单元测试
npm run pack      # 重算 checksums.json，打包到 dist/（组件 zip、源码 zip 和 Release 用的 manifest.json）
npm run preview   # 本地演示页 http://127.0.0.1:8766/，所有平台都是模拟的
```

发版：把 `plugin-packages/multi-platform-notify/manifest.json` 的 `version` 改好，推送同名的 `vX.Y.Z` 标签，GitHub Actions 会校验版本、跑测试、打包并创建 Release。

预览明确标为演示模式，扫码、配对、QQ 绑定和发送都使用本地模拟结果，不联系真实账户。协议测试覆盖直接授权、会话刷新、收件人隔离、令牌失效、平台拒绝、空回执、未知结果和绑定变更拦截。真实到账仍需用户完成账号授权后，在实际目标平台核对；没有已绑定账号时不能完成此项验收。

二维码依赖 `qrcode-generator` 2.0.4，MIT 许可，版权信息保留在 `ui/vendor/qrcode.js`。

参考：[腾讯微信渠道](https://docs.openclaw.ai/zh-CN/channels/wechat)、[QQ Bot 渠道](https://docs.openclaw.ai/zh-CN/channels/qqbot)、[飞书自定义机器人](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)、[企业微信消息推送](https://developer.work.weixin.qq.com/document/path/91770)、[钉钉加签](https://open.dingtalk.com/document/robots/customize-robot-security-settings)。

## 许可

[MIT](LICENSE)

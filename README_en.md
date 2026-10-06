# Multi-platform notifications for CurSimple

Forward class notices, note deadlines and component updates from [CurSimple](https://github.com/cursimple/cursimple-app) to multiple independently configured targets.

[中文](README.md) · [Downloads](https://github.com/cursimple/cursimple-notify-component/releases) · [Host API](https://github.com/cursimple/cursimple-app/blob/main/docs/plugin-system.md#notification-receivers)

Platform protocols, authorization, recipients and formatting live in this component. The host supplies generic events, restricted transport, encrypted storage and TLS mail. QQ and personal WeChat support direct binding without deploying OpenClaw.

## Supported channels

| Channel | Connection | Required configuration |
|---|---|---|
| Personal WeChat | Tencent iLink bot protocol | Scan QR, complete optional pairing, then message the connected bot |
| QQ | Official Bot API | Enabled bot, AppID/AppSecret, recipient OpenID |
| Feishu | Custom group webhook | Webhook, optional signing key and required keyword |
| WeCom | Group webhook | Webhook |
| DingTalk | Custom group webhook | Webhook, optional signing key and required keyword |
| QQ Mail | TLS SMTP, `smtp.qq.com:465` | Sender, SMTP authorization code and recipients |
| NetEase 163 / 126 | TLS SMTP, `smtp.163.com` / `smtp.126.com` | Sender, client authorization code and recipients |
| ServerChan | SCT or sctp SendKey API | SendKey and platform-configured receiving channel |
| PushPlus | Send API with optional result query | Token, optional group and query access |
| WxPusher | AppToken API | AppToken and subscribed recipient UIDs |
| PushDeer | Official or custom HTTPS service | PushKey |
| Bark | Official or custom HTTPS service | iOS device key |
| Custom webhook / OpenClaw | HTTPS endpoint | Endpoint, optional token and fixed route |

Each target has independent enablement, event kinds and body inclusion. Targets receive newly created events after binding; historical notices are not replayed. Completed, read, ignored or expired sources stop pending delivery. Background operation requires connectivity and host scheduling access.

## Installation

Requires host plugin **API 8**. Older hosts reject the component rather than silently dropping unsupported capabilities. The required host API is currently available in development builds; check the installed app before importing.

1. Download `multi-platform-notify-vX.Y.Z.zip` from Releases.
2. In CurSimple, open Plugins → Components → Import ZIP.
3. Add a notification target, authorize its channel and save.
4. Send a test and verify the actual receiving application.

Protocol tests and rejected-key endpoint checks do not prove real delivery. **Authenticated end-to-end receipt has not been verified for every channel.** A platform receipt does not prove that a user read the message.

## Direct binding

### Personal WeChat

Choose direct connection and scan the locally generated QR. On one phone, save the QR and scan it from WeChat's image picker. Complete pairing if requested, then send a message to the connected bot. Only the scanning account's private conversation is eligible; arbitrary contacts and group broadcasts are unsupported.

The adapter follows Tencent's published `@tencent-weixin/openclaw-weixin` 2.4.9 iLink implementation for QR expiry, pairing, endpoint selection, sessions and text sending. It does not invoke the OpenClaw CLI. Expired or rejected sessions require reconnecting or refreshing conversation context through the bot.

### QQ

Create and enable a bot through the [QQ platform](https://bot.q.qq.com/), granting the required private/group events and proactive-message access. Account passwords, QQ numbers and group numbers cannot replace bot credentials or OpenIDs.

Enter credentials and use recipient discovery: message the bot privately, or mention it in the target group with the temporary binding phrase. Discovery reads the official Gateway event and closes its connection when completed or cancelled. Manual event-derived OpenID entry is also supported. OpenIDs are specific to the bot.

Authorization uses `bots.qq.com/app/getAppAccessToken`; messages use the official user/group message routes. A valid returned message ID is required for confirmation. Tokens are encrypted and refreshed on expiry or explicit authentication rejection. Permissions, quotas and recent-interaction rules can still reject proactive delivery; those errors remain visible.

### Mail

Enable SMTP and generate the provider's authorization code, rather than using the account login password. Sender and recipient can be the same mailbox. QQ/Foxmail aliases require the corresponding SMTP account access.

The host validates TLS certificates on port 465 and sends UTF-8 MIME text. Final SMTP 250 confirms server acceptance only. Spam filtering or recipient rejection remains possible; disconnect after body submission requires checking the mailbox before retrying.

### Push services

ServerChan supports both SendKey families. Configure its receiving route on the platform first. PushPlus can query final results when query access is configured; otherwise its queue acceptance stays marked as accepted. WxPusher validates each recipient's receipt. PushDeer text messages put the complete message in `text`, without relying on Markdown-only `desp`. Custom PushDeer and Bark services require HTTPS.

## Delivery states and privacy

- **Sent**: explicit platform send confirmation.
- **Accepted**: request accepted without a final delivery result.
- **Queued / querying**: pending platform status; subsequent checks query the existing operation.
- **Failed**: explicit rejection or confirmed failure.
- **Needs verification**: ambiguous submission or receipt persistence; automatic resend stops.

Results persist per target immediately. One failure does not block other targets; retries retain completed targets. WeChat retries use a stable event/target-derived client ID. Binding changes prevent stale configurations from continuing to send.

Keystore encrypts webhook credentials, authorization codes, tokens and session context. They are excluded from public snapshots, ordinary logs and backups. Cards show destination domains rather than secrets.

## Optional OpenClaw bridge

Existing OpenClaw installations can retain bridge mode. Configure fixed routes in `bridge/config.json`, copied from `bridge/config.example.json`, and set a `CURSIMPLE_NOTIFY_BRIDGE_TOKEN` of at least 24 characters.

```sh
node bridge/server.mjs bridge/config.json
```

The default listener is `127.0.0.1:8787`; the phone uses an HTTPS reverse proxy at `/v1/notify`. Route IDs resolve to server-configured accounts and recipients. Requests cannot supply shell commands. Deduplication uses route and event IDs; CLI replies need the expected channel, non-dry-run send result and a valid message ID.

WeChat uses channel ID `openclaw-weixin`; QQ uses `qqbot`.

## Development

Node.js 20+, no dependency installation required.

```sh
npm test
npm run pack
npm run preview
```

Packing regenerates `checksums.json` and writes component/source ZIPs and release metadata into ignored `dist/`. Preview at `http://127.0.0.1:8766/` uses simulated QR, binding and delivery data only.

Set the manifest version and matching package version, then push the corresponding `vX.Y.Z` tag. CI validates, tests, packs and creates the Release. Do not pre-create a duplicate Release.

Tests cover authentication, session isolation, token renewal, rejected and empty responses, ambiguous results, per-recipient receipts and stale-binding prevention. Real receipt requires an authorized account and verification in the actual channel.

`ui/vendor/qrcode.js` retains `qrcode-generator` 2.0.4 MIT attribution.

References: [Tencent WeChat channel](https://docs.openclaw.ai/zh-CN/channels/wechat), [QQ channel](https://docs.openclaw.ai/zh-CN/channels/qqbot), [Feishu bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot), [WeCom push](https://developer.work.weixin.qq.com/document/path/91770), [DingTalk signing](https://open.dingtalk.com/document/robots/customize-robot-security-settings).

[MIT License](LICENSE)

## Page interactions

Version 1.2.3 uses rounded press feedback, a sliding selection indicator and dismissible sheets based on the YuKeTang component interactions. Platform changes preserve draft fields and scroll position. Unchanged delivery polling preserves the page; pending sends prevent duplicate clicks. Controls follow host colors, font scale and reduced-motion preferences.

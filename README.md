# DSH Pet

独立的 DeepSeek Harness 桌宠。只读监听 dsh 会话日志，用蓝色桌宠展示思考、执行工具、协作、整理上下文、等待确认、错误和完成状态。

- 一个桌宠聚合近期 dsh 会话；授权等待与错误优先展示。
- 点击桌宠查看会话状态和最近完成摘要；在面板中打开 DeepSeek Harness。
- 拖动桌宠移动位置；右键或菜单栏图标展示/隐藏、打开 dsh、退出。
- dsh 桌面插件在皮肤控件上方提供展示/隐藏开关。
- 鼠标悬停、窗口最小化、失焦不会生成状态小窗。
- 桌宠身后的小金库按账户可用总额度（赠送 + 充值）分五档显示金币、宝石；旁边的赔偿小荷包单独反映赠送账户余额（含平台补偿）。两个入口分别点击查看总余额与赠送/补偿余额，并手动刷新；赠送为零时，小金库仍反映充值余额，小荷包为空。荷包余额已包含在总余额中，不重复相加。

![小金库与赔偿小荷包（使用合成测试余额）](docs/images/treasury-pouch.png)

## 运行与构建

macOS，Node.js 20+，Electron 33.4.11。

```bash
npm ci
npm start
npm test
npm run test:native
npm run test:treasure-native
npm run build:plugin
npm run package:mac
```

将 `dist/DSH Pet.app` 复制到 `/Applications`。本地包使用 ad-hoc 签名，文件名带 `local`；公开发布需要独立的 Apple 签名/公证流程。

安装 dsh 桌面插件：

```bash
dsh plugin --profile desktop add /absolute/path/dsh-pet/dist/dsh-pet-companion-0.1.4.tgz --offline --ignore-scripts
```

关闭并重新打开 dsh 后生效。先移除之前安装的旧桌宠插件，避免重复按钮。

## 独立边界

应用无需其他桌宠项目或应用即可运行。没有其他 agent 的 hooks、状态监听、计费、工作台、皮肤管理和程序启动器。

- 状态来源：`$DSH_HOME/sessions`，默认 `~/.dsh/sessions`；支持 v0/v4 明文和 zstd 日志，只读。
- 配置及运行时：`~/.dsh-pet`，保存隐藏开关与位置；开发测试可设置 `DSH_PET_DATA`。
- 本地控制：`127.0.0.1:41430–41434`，能力 token 只在 Host 与桌宠之间传递。
- 插件开关：dsh 的 `/api/dsh-pet` 受原有连接认证保护；仅桌面客户端启用。
- `DSH_PET_APP` 可指定独立 app 路径，`DSH_DESKTOP_APP` 可指定 dsh app 路径。

日志协议改变时未知版本会停止解析该会话，避免错误显示。授权操作仍在 dsh 内完成。

小金库通过官方 Host 的 `deepseekAccount.getBalance()` 读取 `bonusWallets` 与 `normalWallets`，在每个币种内精确求和得到可用总额度；小荷包仅使用该币种的赠送账户余额。接口没有单笔赔偿来源或历史明细，因此荷包标明赠送账户余额（含平台补偿），不伪造单独的赔偿账本。无需额外填写 API Key，凭证及余额不在本应用落盘。每 5 分钟自动更新；手动刷新在下一次本地轮询（最多约 10 秒）发起。退出账号或停用插件清空金额，查询失败保留最近结果并提示，超过 6 分钟标为过期。未知余额与真实零余额分开显示，各币种不相加或换汇。

`npm run test:treasure-native` 使用临时数据目录验证余额同步、宝箱与荷包的独立档位、真实原生点击、详情切换与布局、刷新、登出与退出清除；`dist/treasure-preview.png` 使用测试余额作为界面预览。

来源和素材署名见 [NOTICE.md](NOTICE.md)、[LICENSE](LICENSE) 和 [assets/pet/CREDITS.md](assets/pet/CREDITS.md)。

## 发布内容与隐私

仓库包含独立应用源码、测试、必要的桌宠素材与许可证。个人录音、声音克隆样本、演示视频、真实会话和余额、运行时凭证、本机安装记录均不包含在仓库中。界面预览使用合成测试余额。

macOS 构建使用通用 bundle ID `com.dshpet.desktop`。小荷包展示赠送账户汇总余额（含平台补偿），不能识别单笔赔偿来源；荷包余额已经包含在小金库总余额里。

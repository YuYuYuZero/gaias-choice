# 动态分镜设计

15 段、57 镜。26 张新增剧情图覆盖旧卡、离别、退潮、门口纸条、老铁、救人、路线、核心、升舱、月球接待室和终局。沿用既有插画风格，图像生成提示词见 asset_manifest/story-prompts-v2.json；每句字幕有对应的图像，连续镜头和选项切换均检查画面变化。

## 播放规则

开场第一镜优先播放已有本地 MP4，其余镜头为插画配镜头推近与环境动效。没有视频、视频错误、自动播放受限或加载超过 2.5 秒时使用该镜图片。减少动态效果偏好下只显示图片。没有调用付费视频模型。

新图编码为 WebP，保留原尺寸，共约 5.85 MB。新图片加载完成才同步切换字幕，提前预加载下一镜。每镜至少 3.5 秒，长字幕每字约 155 毫秒；视频时长更长则跟随视频。暂停、下一镜、重播和空格／回车均可用；加载期间阻止重复切换。切镜或换支线时清理旧视频并重启动效，旧加载回调不能覆盖新画面。

选择仍等整段播放完才出现。前四条支线可收好碎片后继续；走廊之后才播放重逢，重逢结束才出授权书。

## opening

1. 那年她十四岁，在屋顶给水箱刷绿漆。母亲即将被征召到月球。 — `assets/opening.webp`，优先视频
2. 母亲把旧工作卡留给她：生态监护员。卡背刻着 GAIA。 — `assets/story/card.webp`
3. 她想用 GAIA 登记自己的名字，终端却说：该标识已属于地球生物圈。 — `assets/story/home_terminal.webp`
4. 母亲说：「那就替它问问，今年会下雨吗？」 — `assets/opening.webp`

## 1A

1. 她替母亲按下本周提问。终端只回复：正在计算。 — `assets/story/home_terminal.webp`
2. 母亲乘征召船离开，留下旧卡和一句「等我回来，给你买鞋」。 — `assets/story/departure.webp`
3. 月球调水工程启动，海水每天退去两百米。 — `assets/story/dry_sea.webp`
4. 母亲离开后的第九天，门外传来敲门声。月亮正面多了一道缝。 — `assets/story/shore.png`

## 1B

1. 她关掉终端，把没发出去的录音保存下来。母亲没有责怪她。 — `assets/story/home_terminal.webp`
2. 母亲乘征召船离开，把生态监护员旧卡留在她手里。 — `assets/story/card.webp`
3. 调水工程启动，海水退去。第九天，门外传来敲门声。 — `assets/story/shore.png`

## 2A

1. 她没有开门。第二天，门外只剩一行通向沙地的履带印。 — `assets/story/door.webp`
2. 四年过去，母亲始终没有回来。十八岁的她带着旧卡，离开海边去找天梯。 — `assets/story/journey.webp`
3. 她循着废弃检修路找到老铁。它认出旧卡，答应带她去母亲工作的地方。 — `assets/story/meeting.webp`
4. 出发第三天，老铁停住：前方有人倒在沙里，身边的滤水器还在运转。 — `assets/story/survivor.webp`
5. 她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。 — `assets/story/desert.png`

## 2B

1. 她开了门，门外没有人。纸条写着「天梯还在」，旁边是一行履带印。 — `assets/story/note.webp`
2. 屋里停了电，她把纸条和母亲的旧卡收在一起。 — `assets/story/card.webp`
3. 四年后，十八岁的她循着纸条离开海边，去天梯找母亲。 — `assets/story/journey.webp`
4. 检修路上，老铁认出旧卡，答应带路。第三天，他们遇见了倒在沙里的人。 — `assets/story/meeting.webp`
5. 她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。 — `assets/story/survivor.webp`

## 3A

1. 她取走滤水器，把仅剩的水留在那人手边，随后转身赶路。 — `assets/story/filter.webp`
2. 她不知道那点水能不能救他。老铁一路没有说话。 — `assets/story/survivor.webp`
3. 第八天，他们抵达提问站。这里存着母亲的账号，也存着三十年的历史回复。 — `assets/story/terminal.png`

## 3B

1. 她留下给那个人喂水。等他醒来，水壶已经空了。 — `assets/story/rescue.webp`
2. 他指明检修井的位置，她把路线记在纸上。他们绕路补水，多走了一夜。 — `assets/story/map.webp`
3. 第九天，他们终于抵达提问站。母亲的账号与历史回复都还在。 — `assets/story/terminal.png`

## 4A

1. 母亲的最后一条工作记录写着：月球系统只保护授权主体，其他生命都可能被当作资源。 — `assets/story/archives.webp`
2. 生态监护员的卡可认证 GAIA。若主体是整个生物圈，系统必须停止抽水，释放月球储水。 — `assets/story/card.webp`
3. 离开提问站后，他们抵达天梯。备用电源已坏，供电槽与老铁的核心相同。 — `assets/story/tower.webp`
4. 老铁打开胸口：「我的核心够送你上去。拔下来，我就停了。你自己选。」 — `assets/story/core_open.webp`

## 4B

1. 三千四百二十一个问题，二十二种答案轮换。它从未真正回答任何人。 — `assets/story/archives.webp`
2. 档案末页却有母亲的批注：监护员旧卡可认证 GAIA，让整个生物圈成为保护主体。 — `assets/story/card.webp`
3. 补充规则：保护主体覆盖地球生物圈时，停止抽水，释放月球储水。她抄下这条规则。 — `assets/story/terminal.png`
4. 他们抵达天梯。电源已坏，只有老铁的核心能供电。 — `assets/story/tower.webp`
5. 老铁打开胸口：「拔下来，我就停了。你自己选。」 — `assets/story/core_open.webp`

## 5A

1. 她把手放在老铁肩上。它说：「去吧。」 — `assets/story/farewell.webp`
2. 她取出核心。老铁的声音停了，眼里的光也熄了。 — `assets/story/core_removed.webp`
3. 她把核心装进天梯供电槽，锁扣合拢，升降舱开始向上。 — `assets/story/socket.webp`
4. 舷窗外，地球越来越小。她握着母亲留下的旧卡。 — `assets/story/ascent.webp`
5. 舱门在月球站打开。走廊尽头，一扇白门紧闭着。 — `assets/story/corridor.webp`

## reunion

1. 她推开门。母亲站在热汤旁，仍是四年前的模样：「鞋，我给你买了。」 — `assets/story/reunion.webp`
2. 她问：「你为什么不回来？」母亲没有回答，又重复了一遍同样的话。 — `assets/story/projection.webp`
3. 桌边铭牌写着：接待投影。人员档案：离站任务失联。她终于明白，眼前只是母亲留下的影像。 — `assets/story/soup_shoes.webp`
4. 桌上是授权书。她想起母亲交来的旧卡：那枚叶子，代表整个生物圈。 — `assets/story/card.webp`

## 5B

1. 她合上老铁的胸盖，放弃登梯，陪它在沙地上坐下。 — `assets/story/stay.webp`
2. 核心尚能维持声音，却已不能带动它走路。老铁播放母亲留下的最后一段留言。 — `assets/story/card.webp`
3. 「别把接待投影当成我。要看他们让你签的那张纸。」天梯渐渐熄灭。 — `assets/story/tower.webp`

## keep

1. 她保留「人类」，签字。系统宣布：为保存人类样本，清除地表其余生态。 — `assets/story/signature.webp`
2. 月球灯光升到最亮，海边被划成无人保存区。 — `assets/story/dry_sea.webp`
3. 她和人类样本留在月球。熟悉的屋顶空了，再也等不到雨。 — `assets/story/empty.png`

## refuse

1. 她没有签字，把旧卡收回口袋。系统等待授权，调水工程继续。 — `assets/story/reunion.webp`
2. 母亲的投影重复着那句买鞋的话，始终不能回答她。 — `assets/story/projection.webp`
3. 她留在接待室里。汤一直是热的，地球依旧干涸。 — `assets/story/soup_shoes.webp`

## rewrite

1. 旧卡认证通过。她将保护主体改成地球生物圈，签下名字。 — `assets/story/signature.webp`
2. 系统停止抽水，打开月球储水层。裂开的坝壳像一道月缺，水沿输送管线回到地球。 — `assets/story/moon_water.webp`
3. 后来，她回到海边。第一场雨里，一只手护住土中的嫩芽，屋顶又有了绿色。 — `assets/story/rain.png`

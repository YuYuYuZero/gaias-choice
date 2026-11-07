/* Pre-rendered illustrations with browser animation; never calls a model. */
(function (global) {
  'use strict';
  var images = {
    opening: 'assets/opening.webp', shore: 'assets/story/shore.png',
    desert: 'assets/story/desert.png', terminal: 'assets/story/terminal.png',
    room: 'assets/story/room.png', rain: 'assets/story/rain.png', empty: 'assets/story/empty.png'
  };
  // [image, caption, focal x %, focal y %, zoom, atmosphere]
  var scenes = {
  "opening": [
    [
      "opening",
      "那年她十四岁，在屋顶给水箱刷绿漆。母亲即将被征召到月球。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "opening",
      "母亲把旧工作卡留给她：生态监护员。卡背刻着 GAIA。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "opening",
      "她想用 GAIA 登记自己的名字，终端却说：该标识已属于地球生物圈。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "opening",
      "母亲说：「那就替它问问，今年会下雨吗？」",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "1A": [
    [
      "opening",
      "她替母亲按下本周提问。终端只回复：正在计算。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "opening",
      "母亲乘征召船离开，留下旧卡和一句「等我回来，给你买鞋」。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "月球调水工程启动，海水每天退去两百米。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "母亲离开后的第九天，门外传来敲门声。月亮正面多了一道缝。",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "1B": [
    [
      "opening",
      "她关掉终端，把没发出去的录音保存下来。母亲没有责怪她。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "opening",
      "母亲乘征召船离开，把生态监护员旧卡留在她手里。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "调水工程启动，海水退去。第九天，门外传来敲门声。",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "2A": [
    [
      "shore",
      "她没有开门。第二天，门外只剩一行通向沙地的履带印。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "四年过去，母亲始终没有回来。十八岁的她带着旧卡，离开海边去找天梯。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "desert",
      "她循着废弃检修路找到老铁。它认出旧卡，答应带她去母亲工作的地方。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "出发第三天，老铁停住：前方有人倒在沙里，身边的滤水器还在运转。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "2B": [
    [
      "shore",
      "她开了门，门外没有人。纸条写着「天梯还在」，旁边是一行履带印。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "屋里停了电，她把纸条和母亲的旧卡收在一起。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "shore",
      "四年后，十八岁的她循着纸条离开海边，去天梯找母亲。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "desert",
      "检修路上，老铁认出旧卡，答应带路。第三天，他们遇见了倒在沙里的人。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "她的水只够一人撑到提问站。拿走滤水器能赶路；救人就得绕路找水。",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "3A": [
    [
      "desert",
      "她取走滤水器，把仅剩的水留在那人手边，随后转身赶路。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "她不知道那点水能不能救他。老铁一路没有说话。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "terminal",
      "第八天，他们抵达提问站。这里存着母亲的账号，也存着三十年的历史回复。",
      50,
      50,
      1.12,
      "scan"
    ]
  ],
  "3B": [
    [
      "desert",
      "她留下给那个人喂水。等他醒来，水壶已经空了。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "他画出一口检修井和通向天梯的路线。她与老铁绕路补水，多走了一夜。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "terminal",
      "第九天，他们终于抵达提问站。母亲的账号与历史回复都还在。",
      50,
      50,
      1.12,
      "scan"
    ]
  ],
  "4A": [
    [
      "terminal",
      "母亲的最后一条工作记录写着：月球系统只保护授权主体，其他生命都可能被当作资源。",
      50,
      50,
      1.12,
      "scan"
    ],
    [
      "terminal",
      "生态监护员的卡可认证 GAIA。若主体是整个生物圈，系统必须停止抽水，释放月球储水。",
      50,
      50,
      1.12,
      "scan"
    ],
    [
      "desert",
      "离开提问站后，他们抵达天梯。备用电源已坏，供电槽与老铁的核心相同。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "老铁打开胸口：「我的核心够送你上去。拔下来，我就停了。你自己选。」",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "4B": [
    [
      "terminal",
      "三千四百二十一个问题，二十二种答案轮换。它从未真正回答任何人。",
      50,
      50,
      1.12,
      "scan"
    ],
    [
      "terminal",
      "档案末页却有母亲的批注：监护员旧卡可认证 GAIA，让整个生物圈成为保护主体。",
      50,
      50,
      1.12,
      "scan"
    ],
    [
      "terminal",
      "补充规则：保护主体覆盖地球生物圈时，停止抽水，释放月球储水。她抄下这条规则。",
      50,
      50,
      1.12,
      "scan"
    ],
    [
      "desert",
      "他们抵达天梯。电源已坏，只有老铁的核心能供电。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "老铁打开胸口：「拔下来，我就停了。你自己选。」",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "5A": [
    [
      "desert",
      "她把手放在老铁胸前。它说：「去吧。记得看看她是不是真的在那里。」",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "她取出核心，装进天梯供电槽。老铁的声音停了，升降舱开始向上。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "舷窗外，地球越来越小。舱门在月球站打开，前面是一条通向白门的走廊。",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "reunion": [
    [
      "room",
      "她推开门。母亲站在热汤旁，仍是四年前的模样：「鞋，我给你买了。」",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "room",
      "她问：「你为什么不回来？」母亲没有回答，又重复了一遍同样的话。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "room",
      "桌边铭牌写着：接待投影。人员档案：离站任务失联。她终于明白，眼前只是母亲留下的影像。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "room",
      "汤旁放着授权书：以「人类」为保护主体，其他生命可被清除。她握紧口袋里的旧卡。",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "5B": [
    [
      "desert",
      "她合上老铁的胸盖，放弃登梯，陪它在沙地上坐下。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "核心尚能维持声音，却已不能带动它走路。老铁播放母亲留下的最后一段留言。",
      50,
      50,
      1.12,
      "sand"
    ],
    [
      "desert",
      "「别把接待投影当成我。要看他们让你签的那张纸。」天梯渐渐熄灭。",
      50,
      50,
      1.12,
      "sand"
    ]
  ],
  "keep": [
    [
      "room",
      "她保留「人类」，签字。系统宣布：为保存人类样本，清除地表其余生态。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "empty",
      "月球灯光升到最亮，海边被划成无人保存区。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "empty",
      "她和人类样本留在月球。熟悉的屋顶空了，再也等不到雨。",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "refuse": [
    [
      "room",
      "她没有签字，把旧卡收回口袋。系统等待授权，调水工程继续。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "room",
      "母亲的投影重复着那句买鞋的话，始终不能回答她。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "room",
      "她留在接待室里。汤一直是热的，地球依旧干涸。",
      50,
      50,
      1.12,
      "light"
    ]
  ],
  "rewrite": [
    [
      "room",
      "旧卡认证通过。她将保护主体改成地球生物圈，签下名字。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "rain",
      "系统停止抽水，打开月球储水层。裂开的坝壳像一道月缺，水沿输送管线回到地球。",
      50,
      50,
      1.12,
      "light"
    ],
    [
      "rain",
      "后来，她回到海边。第一场雨里，一只手护住土中的嫩芽，屋顶又有了绿色。",
      50,
      50,
      1.12,
      "light"
    ]
  ]
};
  function create(options) {
    var stage = options.stage, root = document.createElement('div');
    root.className = 'story-cinema'; root.hidden = true; root.setAttribute('aria-label', '动态分镜');
    var layers = [document.createElement('img'), document.createElement('img')];
    layers.forEach(function (img) { img.className = 'story-still'; img.alt = ''; root.appendChild(img); });
    var atmosphere = document.createElement('div'); atmosphere.className = 'story-atmosphere'; atmosphere.setAttribute('aria-hidden','true'); root.appendChild(atmosphere);
    var transport = document.createElement('div'); transport.className = 'story-transport';
    var count = document.createElement('span'); count.className = 'story-count';
    var pause = document.createElement('button'); pause.type = 'button'; pause.textContent = '暂停'; pause.setAttribute('aria-label','暂停分镜');
    var next = document.createElement('button'); next.type = 'button'; next.textContent = '下一镜 →'; next.setAttribute('aria-label','下一镜');
    transport.append(count,pause,next); root.appendChild(transport); stage.appendChild(root);
    var shots = [], index = 0, active = 0, timer = null, listener = null, finished = true, paused = false, generation = 0;
    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
    function notifyState() { if (options.onState) options.onState({ finished: finished }); }
    function cancelTimer() { clearTimeout(timer); timer = null; }
    function updateControls() {
      pause.textContent = finished ? '重播' : paused ? '播放' : '暂停';
      pause.setAttribute('aria-label', finished ? '重播分镜' : paused ? '播放分镜' : '暂停分镜');
      pause.setAttribute('aria-pressed', String(paused));
      next.disabled = finished; next.textContent = index === shots.length - 1 ? '看完本幕 →' : '下一镜 →';
      count.textContent = String(index + 1).padStart(2,'0') + ' / ' + String(shots.length).padStart(2,'0');
      root.classList.toggle('is-paused',paused || finished || document.hidden);
    }
    function schedule() {
      cancelTimer();
      if (!paused && !finished && !document.hidden) timer = setTimeout(advance, Math.max(4300, shots[index][1].length * 160));
    }
    function complete() {
      cancelTimer(); finished = true; updateControls(); notifyState();
      if (listener) { var fn = listener; listener = null; fn(); }
    }
    function show() {
      var shot = shots[index], old = layers[active]; active = 1-active; var img = layers[active];
      var ticket = ++generation;
      img.classList.remove('is-visible'); img.style.animation = 'none';
      img.style.objectPosition = shot[2] + '% ' + shot[3] + '%';
      img.style.setProperty('--shot-zoom',shot[4]);
      img.style.transformOrigin = shot[2] + '% ' + shot[3] + '%';
      img.alt = shot[1];
      function reveal() {
        if (ticket !== generation || root.hidden) return;
        old.classList.remove('is-visible'); old.setAttribute('aria-hidden','true'); img.classList.add('is-visible'); img.setAttribute('aria-hidden','false');
        void img.offsetWidth; img.style.animation = reduced.matches ? 'none' : '';
        atmosphere.dataset.effect = shot[5]; options.onCaption(shot[1]);
        updateControls(); schedule();
      }
      img.onload = reveal;
      img.onerror = function () {
        if (ticket !== generation) return;
        img.onerror = null; img.src = images.opening;
      };
      img.src = images[shot[0]];
      // Browsers dispatch load even for cached images; only that callback starts timing.
    }
    function advance() { if (finished) return; cancelTimer(); if (index + 1 >= shots.length) complete(); else { index++; show(); } }
    pause.addEventListener('click',function () {
      if (finished) { index = 0; finished = false; paused = false; notifyState(); show(); return; }
      paused = !paused; updateControls(); schedule();
    });
    next.addEventListener('click',advance);
    function visibility() { updateControls(); schedule(); }
    document.addEventListener('visibilitychange',visibility);
    return {
      play: function (key) {
        cancelTimer(); listener = null; generation++; shots = scenes[key] || scenes.opening;
        index = 0; finished = false; paused = false; root.hidden = false; notifyState(); show();
        shots.forEach(function (shot) { var preload = new Image(); preload.src = images[shot[0]]; });
      },
      after: function (fn) { if (finished) { fn(); return function () {}; } listener = fn; return function () { if (listener === fn) listener = null; }; },
      stop: function () { cancelTimer(); generation++; listener = null; finished = true; root.hidden = true; notifyState(); layers.forEach(function(img){img.onload=null;img.onerror=null;}); },
      finish: complete
    };
  }
  global.GaiaStoryboard = { create: create, scenes: scenes, images: images };
})(window);

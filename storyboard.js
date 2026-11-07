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
    opening: [['opening','春天，屋顶。她给水箱刷完最后一道绿漆。',35,8,1.04,'dust'],['opening','「今年会下雨吗？」',76,25,1.12,'light'],['opening','身份卡报错：GAIA 已被占用。母亲说：「那就抢回来。」',40,5,1.1,'light']],
    '1A': [['opening','她替母亲按下了本周的提问。',35,55,1.15,'light'],['shore','海一天退两百米。',60,50,1.04,'mist'],['shore','第九天，门外传来敲门声。月亮正面多了一道缝。',80,28,1.2,'mist']],
    '1B': [['terminal','她关掉终端。',50,55,1.08,'scan'],['terminal','录音停在第十四秒。有人吸了一口气。',38,45,1.22,'scan'],['terminal','屏幕黑下去。那句话没有发出去。',50,50,1.12,'black']],
    '2A': [['shore','她没有开门。',28,60,1.18,'mist'],['desert','四年后，鞋底磨穿了。老铁的膝盖还在滴油。',43,63,1.12,'sand'],['desert','沙里躺着一个人，手边有一只滤水器。',50,80,1.22,'sand']],
    '2B': [['shore','她打开门。门外没有人。',25,60,1.18,'mist'],['terminal','门缝里塞进来一张纸：天梯还在。',65,80,1.26,'dust'],['shore','灯灭了。',25,55,1.12,'black']],
    '3A': [['desert','她拿走滤水器，没有回头。',50,80,1.24,'sand'],['desert','风把来时的路抹平。',75,42,1.07,'sand'],['terminal','提问站的屏幕还亮着。三十年的问题都存在这里。',48,48,1.12,'scan']],
    '3B': [['desert','她把水给了那个人。',48,65,1.16,'sand'],['desert','他画了一张图，塞进她手里。',48,85,1.27,'sand'],['desert','风一过，沙盖住了脚印。',75,75,1.1,'sand']],
    '4A': [['terminal','母亲的账号还在。',48,45,1.22,'scan'],['terminal','那些问题，始终停在这里。',65,65,1.14,'scan'],['desert','天梯就在前面。老铁说，它上不去了。',55,30,1.12,'sand']],
    '4B': [['terminal','三千四百二十一个问题。',48,40,1.12,'scan'],['terminal','二十二种答案，轮着用。',48,45,1.26,'scan'],['terminal','屏幕停止滚动。',48,45,1.28,'black']],
    '5A': [['desert','她亲手拔下老铁的核心。',42,65,1.22,'dust'],['room','走廊很长。只剩脚步声和呼吸。',50,42,1.05,'cold'],['room','桌上一碗热汤。母亲背对着她：「鞋，我给你买了。」',52,65,1.16,'steam']],
    '5B': [['desert','她在天梯脚下坐下。',45,65,1.13,'sand'],['desert','老铁的膝盖不再滴油。',44,72,1.26,'dust'],['desert','沙慢慢盖住脚印。它不再动了。',65,80,1.14,'sand']],
    keep: [['room','她保留了那两个字，签下名字。',50,78,1.24,'cold'],['empty','灯一盏一盏亮到最亮。',50,45,1.06,'white'],['empty','海边的屋顶很干净。没有人。',45,60,1.14,'white']],
    refuse: [['room','她没有签字。',50,78,1.24,'cold'],['room','房间一直亮着。',50,40,1.05,'cold'],['room','汤一直是热的。',50,76,1.28,'steam']],
    rewrite: [['room','她划掉那两个字，贴上母亲的旧卡，签了字。',50,78,1.23,'steam'],['rain','月亮裂开一道口子。第一场雨落下来。',66,20,1.05,'rain'],['rain','土里伸出一只手。灰黄的大地上，多了一线绿。',35,80,1.2,'rain']]
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
      if (!paused && !finished && !document.hidden) timer = setTimeout(advance, index === 0 ? 5200 : 4300);
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

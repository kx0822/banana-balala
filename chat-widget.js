/* ============================================================
 * 香蕉的解忧小铺 - 悬浮聊天小窗组件
 * ============================================================
 * 用法：每个页面 </body> 前依次引入：
 *   <script src="chat-answers.js"></script>
 *   <script src="chat-widget.js"></script>
 *
 * 【功能】
 *   1. 右下角缩略图（图片，可拖动）；点击展开弹窗（弹窗可拖动、右下角可拖拉调整大小）
 *   2. 弹窗右上角"减号"收起；"导出"按钮导出本会话记录为 txt（格式同原 Python 版）
 *   3. 随机回答：从 chat-answers.js 的 window.CHAT_ANSWERS 随机抽一条
 *
 * 【存储分层 —— 重要】
 *   - 位置 cb_chat_pos  → localStorage  ：跨会话记住拖到哪
 *   - 聊天记录 cb_chat_history、开合状态 cb_chat_open → sessionStorage：
 *     同标签页内跳转保留；关掉标签页/浏览器再打开即清空
 *
 * 【维护指南】
 *   - 改回答内容：只改 chat-answers.js 里的 window.CHAT_ANSWERS（空格分隔）
 *   - 改配色/尺寸/延迟：改下方【常量】与【样式】区
 *   - 换图：替换 assets/chat-icon.png、assets/back-icon.png（同名覆盖即可）
 * ============================================================ */
(function () {
    'use strict';

    /* ==================== 1. 常量（改这里就好） ==================== */
    var THUMB_SIZE  = 64;    // 缩略图边长 px
    var MARGIN      = 20;    // 默认离屏幕边缘距离 px
    var PANEL_W     = 320;   // 弹窗默认宽
    var PANEL_H     = 430;   // 弹窗默认高
    var MAX_MSGS    = 200;   // 聊天记录上限
    var REPLY_DELAY = 800;   // "loading......" 时长 ms
    var AUTO_OPEN   = false; // 调试用：true 即加载就展开

    // localStorage（长期）：只存位置
    var KEY_POS    = 'cb_chat_pos';
    // sessionStorage（会话级，关标签页即清）：存记录与开合状态
    var KEY_HISTORY = 'cb_chat_history';
    var KEY_OPEN    = 'cb_chat_open';

    /* ==================== 2. 存储封装 ==================== */
    function makeStorage(which) {
        var s = which === 'session' ? window.sessionStorage : window.localStorage;
        return {
            get: function (k) {
                try { return s.getItem(k); } catch (e) { return null; }
            },
            set: function (k, v) {
                try { s.setItem(k, v); } catch (e) { /* 隐私模式等场景静默失败 */ }
            }
        };
    }
    var persist = makeStorage('local');    // 长期：位置
    var sess     = makeStorage('session');  // 会话：记录、开合

    /* ==================== 3. 样式 ==================== */
    var CSS = '' +
        '#cbThumb{position:fixed;z-index:9999;width:' + THUMB_SIZE + 'px;height:' + THUMB_SIZE + 'px;' +
        'padding:0;border:none;background:transparent;cursor:grab;touch-action:none;}' +
        '#cbThumb:active{cursor:grabbing}' +
        '#cbThumb img{width:' + THUMB_SIZE + 'px;height:' + THUMB_SIZE + 'px;display:block;' +
        'border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,.22);' +
        'user-select:none;-webkit-user-drag:none;pointer-events:none;' +
        'transition:transform .15s ease;}' +
        '#cbThumb:hover img{transform:scale(1.06)}' +
        '' +
        '#cbPanel{position:fixed;z-index:10000;width:' + PANEL_W + 'px;height:' + PANEL_H + 'px;' +
        'max-width:min(92vw,560px);max-height:min(80vh,640px);min-width:260px;min-height:220px;' +
        'display:none;flex-direction:column;background:#fff;border-radius:14px;' +
        'box-shadow:0 10px 36px rgba(0,0,0,.22);overflow:hidden;resize:both;box-sizing:border-box;' +
        'font-family:"Microsoft YaHei","PingFang SC","Segoe UI",system-ui,sans-serif;}' +
        '#cbPanel.cb-open{display:flex}' +
        '' +
        '.cb-head{display:flex;align-items:center;gap:6px;height:44px;padding:0 10px 0 16px;' +
        'background:#222;color:#fff;cursor:grab;user-select:none;flex:0 0 auto;}' +
        '.cb-head:active{cursor:grabbing}' +
        '.cb-title{flex:1;font-size:15px;font-weight:600;letter-spacing:.5px;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#cbExport,#cbMin{width:30px;height:30px;flex:0 0 auto;border:none;border-radius:8px;' +
        'background:rgba(255,255,255,.12);color:#fff;font-size:13px;line-height:1;' +
        'font-family:inherit;cursor:pointer;}' +
        '#cbExport{font-size:11px}' +
        '#cbExport:hover,#cbMin:hover{background:rgba(255,255,255,.3)}' +
        '#cbExport:focus-visible,#cbMin:focus-visible{outline:2px solid #ffc83d;outline-offset:1px}' +
        '' +
        '.cb-body{flex:1;overflow-y:auto;padding:12px;background:#f6f6f6;}' +
        '.cb-msg{display:flex;margin:8px 0}' +
        '.cb-u{justify-content:flex-end}' +
        '.cb-b{justify-content:flex-start}' +
        '.cb-bubble{max-width:78%;padding:9px 12px;border-radius:10px;' +
        'font-size:14px;line-height:1.55;word-break:break-word;white-space:pre-wrap}' +
        '.cb-u .cb-bubble{background:#95ec69;color:#333}' +
        '.cb-b .cb-bubble{background:#fff;border:1px solid #e6e6e6;color:#333}' +
        '' +
        '.cb-input-row{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;' +
        'background:#fff;flex:0 0 auto}' +
        '#cbInput{flex:1;min-width:0;padding:9px 12px;border:1px solid #ddd;border-radius:8px;' +
        'font-size:14px;outline:none;color:#333;font-family:inherit}' +
        '#cbInput:focus{border-color:#ffc83d;box-shadow:0 0 0 2px rgba(255,200,61,.35)}' +
        '#cbSend{padding:0 16px;border:none;border-radius:8px;background:#07c160;' +
        'color:#fff;font-size:14px;cursor:pointer;font-family:inherit;}' +
        '#cbSend:hover{filter:brightness(.94)}' +
        '#cbSend:focus-visible{outline:2px solid #222;outline-offset:1px}' +
        '' +
        /* 游戏页"返回主页"按钮（页面自行放 <a class="cb-back">） */
        '.cb-back{position:fixed;top:16px;left:16px;z-index:9998;width:44px;height:44px;' +
        'border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.18);opacity:.92;' +
        'transition:opacity .15s ease,transform .15s ease;}' +
        '.cb-back img{width:44px;height:44px;display:block;border-radius:50%}' +
        '.cb-back:hover{opacity:1;transform:scale(1.06)}' +
        '' +
        '@media (max-width:480px){#cbPanel{width:min(94vw,560px);height:min(76vh,640px)}}';

    var styleEl = document.createElement('style');
    styleEl.id = 'cbStyle';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    /* ==================== 4. DOM ==================== */
    var root = document.createElement('div');
    root.id = 'cbRoot';
    root.innerHTML = '' +
        '<button id="cbThumb" type="button" title="打开香蕉的解忧小铺" aria-label="打开聊天">' +
        '<img src="assets/chat-icon.png" alt="客服小窗" draggable="false"></button>' +
        '<div id="cbPanel" role="dialog" aria-label="香蕉的解忧小铺">' +
        '<div class="cb-head" id="cbHead">' +
        '<span class="cb-title">香蕉的解忧小铺</span>' +
        '<button id="cbExport" type="button" title="导出聊天记录" aria-label="导出记录">导出</button>' +
        '<button id="cbMin" type="button" title="收起" aria-label="收起聊天">&#8722;</button>' +
        '</div>' +
        '<div class="cb-body" id="cbBody"></div>' +
        '<div class="cb-input-row">' +
        '<input id="cbInput" type="text" placeholder="请输入你的困惑？" autocomplete="off">' +
        '<button id="cbSend" type="button">发送</button>' +
        '</div></div>';
    document.body.appendChild(root);

    var thumb   = document.getElementById('cbThumb');
    var panel   = document.getElementById('cbPanel');
    var head    = document.getElementById('cbHead');
    var minBtn  = document.getElementById('cbMin');
    var expBtn  = document.getElementById('cbExport');
    var body    = document.getElementById('cbBody');
    var input   = document.getElementById('cbInput');
    var sendBtn = document.getElementById('cbSend');

    /* ==================== 5. 缩略图位置（localStorage 长期记忆） ==================== */
    function loadPos() {
        try {
            var p = JSON.parse(persist.get(KEY_POS));
            if (p && typeof p.left === 'number' && typeof p.top === 'number') return p;
        } catch (e) { /* 忽略 */ }
        return null;
    }
    function defaultPos() {
        return {
            left: Math.max(MARGIN, window.innerWidth - THUMB_SIZE - MARGIN),
            top:  Math.max(MARGIN, window.innerHeight - THUMB_SIZE - MARGIN)
        };
    }
    var pos = loadPos() || defaultPos();
    function clampPos() {
        var maxL = window.innerWidth - THUMB_SIZE;
        var maxT = window.innerHeight - THUMB_SIZE;
        // 视口过小（如浏览器启动瞬间 1px）不动位置，避免被钳到 0,0
        if (maxL < 8 || maxT < 8) return;
        pos.left = Math.min(Math.max(0, pos.left), maxL);
        pos.top  = Math.min(Math.max(0, pos.top),  maxT);
    }
    function savePos()  { persist.set(KEY_POS, JSON.stringify(pos)); }
    function applyThumb() {
        thumb.style.left = pos.left + 'px';
        thumb.style.top  = pos.top  + 'px';
    }
    clampPos();
    applyThumb();

    /* ==================== 6. 弹窗开合（状态存 sessionStorage） ==================== */
    function openChat(focusInput) {
        panel.classList.add('cb-open');
        thumb.style.display = 'none';
        var r  = panel.getBoundingClientRect();
        var pl = Math.max(8, pos.left + THUMB_SIZE - r.width);
        var pt = Math.max(8, pos.top  + THUMB_SIZE - r.height);
        panel.style.left = pl + 'px';
        panel.style.top  = pt + 'px';
        renderHistory();
        if (focusInput !== false) input.focus();
        sess.set(KEY_OPEN, '1');
    }
    function closeChat() {
        panel.classList.remove('cb-open');
        thumb.style.display = 'block';
        applyThumb();
        sess.set(KEY_OPEN, '0');
    }

    /* ==================== 7. 拖动（缩略图 / 标题栏） ==================== */
    function bindDrag(handle, target) {
        handle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            // 拖弹窗标题栏时头里的按钮不触发拖动；拖缩略图本身不受此限（缩略图自己也是 button）
            if (target === panel && e.target.closest('button')) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var r = target.getBoundingClientRect();
            var origL = r.left, origT = r.top;
            var moved = false;
            document.body.style.userSelect = 'none';

            function onMove(ev) {
                moved = true;
                var l = origL + ev.clientX - startX;
                var t = origT + ev.clientY - startY;
                if (target === thumb) {
                    pos.left = l; pos.top = t;
                    applyThumb();
                } else {
                    // 拖弹窗：同步换算缩略图位置，保证收起后缩略图停在弹窗右下角
                    pos.left = l + target.offsetWidth  - THUMB_SIZE;
                    pos.top  = t + target.offsetHeight - THUMB_SIZE;
                    panel.style.left = l + 'px';
                    panel.style.top  = t + 'px';
                }
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
                clampPos();
                applyThumb();
                savePos();
                if (target === thumb && !moved) openChat(); // 单击缩略图 = 展开
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }
    bindDrag(thumb, thumb);
    bindDrag(head, panel);
    minBtn.addEventListener('click', closeChat);

    /* ==================== 8. 聊天记录（sessionStorage 会话级） ==================== */
    function getAnswers() {
        var arr = (window.CHAT_ANSWERS || '').split(' ').filter(function (x) { return x.trim() !== ''; });
        return arr.length ? arr : ['嗯嗯'];
    }
    var history;
    try { history = JSON.parse(sess.get(KEY_HISTORY)) || []; } catch (e) { history = []; }
    function saveHistory() { sess.set(KEY_HISTORY, JSON.stringify(history)); }
    function pushMsg(t, m) {
        history.push({ t: t, m: m });
        if (history.length > MAX_MSGS) history.shift();
        saveHistory();
    }
    function addMsg(who, text) {
        var row = document.createElement('div');
        row.className = 'cb-msg ' + (who === 'u' ? 'cb-u' : 'cb-b');
        var bubble = document.createElement('div');
        bubble.className = 'cb-bubble';
        bubble.textContent = text;   // textContent 防 XSS
        row.appendChild(bubble);
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
        return row;
    }
    function renderHistory() {
        body.innerHTML = '';
        history.forEach(function (item) { addMsg(item.t, item.m); });
    }

    function send() {
        var q = input.value.trim();
        if (!q) return;
        input.value = '';
        pushMsg('u', q);
        addMsg('u', q);
        var loadingRow = addMsg('b', 'loading......');
        setTimeout(function () {
            if (loadingRow.parentNode) loadingRow.parentNode.removeChild(loadingRow);
            var list = getAnswers();
            var reply = list[Math.floor(Math.random() * list.length)];
            pushMsg('b', reply);
            addMsg('b', reply);
        }, REPLY_DELAY);
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    /* ==================== 9. 导出（格式对齐原 Python 版） ==================== */
    expBtn.addEventListener('click', function () {
        if (!history.length) { alert('暂无聊天记录'); return; }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        var now = new Date();
        var stamp = '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate())
                 + pad(now.getHours()) + pad(now.getMinutes());
        var lines = [
            '欢迎来到香蕉的解忧小铺',
            '如果遇到任何你觉得是bug的或者不合理的情况，请及时通知管理员香蕉',
            '',
            '=====聊天记录====='
        ];
        history.forEach(function (item) {
            lines.push(item.t === 'u' ? '用户：' + item.m : 'ChatBanana：' + item.m);
            lines.push('');
        });
        var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ChatBanana' + stamp + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    /* ==================== 10. 窗口尺寸变化时拉回可视区 ==================== */
    window.addEventListener('resize', function () {
        if (window.innerWidth < 8 || window.innerHeight < 8) return; // 极小视口事件忽略
        clampPos();
        applyThumb();
        if (panel.classList.contains('cb-open')) {
            var r = panel.getBoundingClientRect();
            panel.style.left = Math.max(8, r.left) + 'px';
            panel.style.top  = Math.max(8, r.top)  + 'px';
        }
    });

    /* ==================== 11. 初始化：按上次会话状态恢复 ==================== */
    var savedOpen = sess.get(KEY_OPEN);
    if (AUTO_OPEN || savedOpen === '1') openChat(savedOpen !== '1');
})();

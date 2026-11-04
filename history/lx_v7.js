/*!
 * @name 圈圈音源
 * @description 五平台取播放链接 v7（自适应超时，避开 LX 20秒硬限制）
 * @version 7
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  var API = 'https://api.music.lerd.dpdns.org';

  // LX 对单个 musicUrl 请求有约 20 秒硬限制，这里总预算控制在 19 秒内，
  // 单次请求给 9 秒：快就快，慢就立刻重发（服务器排队的场景重发反而更容易命中）
  var PER_TRY = 9000;
  var TOTAL_BUDGET = 19000;

  function dig(obj, path){
    var cur = obj;
    for (var i = 0; i < path.length; i++){
      if (cur === null || cur === undefined) return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }

  function toObj(v){
    if (typeof v === 'string'){
      try { return JSON.parse(v); } catch (e) { return null; }
    }
    return (v && typeof v === 'object') ? v : null;
  }

  function httpOnce(url, opts, ms){
    return new Promise(function(resolve, reject){
      var settled = false;
      var timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        reject(new Error('timeout'));
      }, ms || PER_TRY);

      try {
        lx.request(url, opts || { method: 'GET' }, function(err, resp){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var b = resp ? toObj(resp.body) : null;
          if (b && (resp.code !== undefined || b.code !== undefined)) return resolve(resp);
          if (resp && resp.body) return resolve(resp);
          reject(new Error('net:' + String(err).slice(0, 50)));
        });
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function bodyOf(resp){
    var b = toObj(resp && resp.body);
    if (b) return b;
    var r = toObj(resp);
    if (r) return r;
    throw new Error('bad body');
  }

  // 初始化：预算 60 秒，每次 9 秒，间隔 800ms
  function doInit(n, deadline){
    return httpOnce(API + '/init.conf', { method: 'GET' }, PER_TRY).then(function(resp){
      var b = bodyOf(resp);
      if (!b || b.code !== 200) throw new Error('code=' + (b && b.code));
      lx.send(EV.inited, b.data.init);
    }).catch(function(e){
      if (n <= 1 || Date.now() > deadline){
        throw new Error('init:' + (e && e.message ? e.message : String(e)));
      }
      return new Promise(function(r){ setTimeout(r, 800); }).then(function(){
        return doInit(n - 1, deadline);
      });
    });
  }
  doInit(8, Date.now() + 60000);

  lx.on(EV.request, function(payload){
    var action = payload.action;
    var source = payload.source;
    var info = payload.info;
    if (action !== 'musicUrl') throw new Error('bad action ' + action);

    var startAt = Date.now();

    // 走完整个三步链路
    function resolveUrl(src, budget){
      var deadline = startAt + TOTAL_BUDGET;
      function left(){
        var d = deadline - Date.now();
        if (d <= 0) return 0;
        return d > budget ? budget : d;
      }

      var t1 = left();
      if (t1 <= 0) return Promise.reject(new Error('out of time'));

      return httpOnce(API + '/' + src, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info)
      }, t1).then(function(resp){
        var b = bodyOf(resp);
        if (b.code === 200 && b.data && b.data.url) return b.data.url;
        if (b.code !== 303 || !b.data || !b.data.request){
          throw new Error((b && b.msg) || ('code=' + (b && b.code)));
        }
        var req = b.data.request, spec = b.data.response || {};
        var t2 = left();
        if (t2 <= 0) return Promise.reject(new Error('out of time'));

        return httpOnce(req.url, req.options || { method: 'GET' }, t2).then(function(resp2){
          var b2 = bodyOf(resp2);
          if (spec.check && spec.check.key){
            var got = dig(resp2, spec.check.key);
            if (got === undefined) got = dig(b2, spec.check.key.slice(1));
            if (String(got) !== String(spec.check.value)){
              throw new Error('check got=' + got);
            }
          }
          var url = spec.url ? dig(resp2, spec.url) : null;
          if (!url && spec.url) url = dig(b2, spec.url.slice(1));
          if (!url && b2 && b2.data) url = b2.data.url;
          if (!url) throw new Error('no url');
          return url;
        });
      });
    }

    // 同源最多试 2 次（服务器排队时第二次往往就中了），总时长超预算就停
    var tried = 0;
    function attempt(){
      if (Date.now() - startAt > TOTAL_BUDGET) {
        return Promise.reject(new Error('budget exceeded'));
      }
      tried++;
      var remain = TOTAL_BUDGET - (Date.now() - startAt);
      var per = remain > PER_TRY ? PER_TRY : remain;
      if (per < 3000) per = 3000;

      return resolveUrl(source, per).catch(function(e){
        if (tried >= 2 || Date.now() - startAt > TOTAL_BUDGET) throw e;
        return new Promise(function(r){ setTimeout(r, 200); }).then(attempt);
      });
    }
    return attempt();
  });
})();

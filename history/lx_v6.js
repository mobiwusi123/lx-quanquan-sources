/*!
 * @name 圈圈音源
 * @description 五平台取播放链接 v6（短超时快速换源，抗服务器慢）
 * @version 6
 * @author 圈圈
 */
;(function(){
  var lx = globalThis.lx;
  var EV = lx.EVENT_NAMES;
  var API = 'https://api.music.lerd.dpdns.org';

  // 服务器是串行排队的，单个请求超 10 秒基本就是没戏，早点放弃换下一个
  var PER_TRY = 10000;

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

  function http(url, opts, ms){
    return httpOnce(url, opts, ms);
  }

  function bodyOf(resp){
    var b = toObj(resp && resp.body);
    if (b) return b;
    var r = toObj(resp);
    if (r) return r;
    throw new Error('bad body');
  }

  // 走完三步拿到最终 URL
  function resolveUrl(source, info, budgetMs){
    var deadline = Date.now() + budgetMs;
    function left(){ var d = deadline - Date.now(); return d < 3000 ? 3000 : d; }

    return http(API + '/' + source, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info)
    }, left()).then(function(resp){
      var b = bodyOf(resp);
      if (b.code === 200 && b.data && b.data.url) return b.data.url;
      if (b.code !== 303 || !b.data || !b.data.request) {
        throw new Error((b && b.msg) || ('code=' + (b && b.code)));
      }
      var req = b.data.request, spec = b.data.response || {};
      return http(req.url, req.options || { method: 'GET' }, left()).then(function(resp2){
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

  // 初始化：最多 6 次，每次 10 秒，间隔递增
  function doInit(n){
    return http(API + '/init.conf', { method: 'GET' }, PER_TRY).then(function(resp){
      var b = bodyOf(resp);
      if (!b || b.code !== 200) throw new Error('code=' + (b && b.code));
      lx.send(EV.inited, b.data.init);
    }).catch(function(e){
      if (n <= 1) throw new Error('init:' + (e && e.message ? e.message : String(e)));
      return new Promise(function(r){ setTimeout(r, 1200); }).then(function(){
        return doInit(n - 1);
      });
    });
  }
  doInit(6);

  lx.on(EV.request, function(payload){
    var action = payload.action;
    var source = payload.source;
    var info = payload.info;
    if (action !== 'musicUrl') throw new Error('bad action ' + action);

    // 本平台先试，失败就依次换其余平台（同一个 candidate 里带其他源的 id 不可知，
    // 所以这里只在同平台内部重试，换源交给 LX 自身的 toggle 机制）
    var plan = [source, source, source];
    var i = 0;

    function step(){
      if (i >= plan.length) return Promise.reject(new Error('all retry failed'));
      var s = plan[i++];
      return resolveUrl(s, info, PER_TRY).catch(function(e){
        if (i >= plan.length) throw e;
        return new Promise(function(r){ setTimeout(r, 300); }).then(step);
      });
    }
    return step();
  });
})();
